import Intents
import UserNotifications

// The app's notification service (an app extension; Albert, 11 Nov 2026: "would it be possible to make it like
// WhatsApp with the photo and then a small yuppie icon?"). Before a chat message's notification shows, it fetches
// the sender's photo and hands iOS the message as a conversation (INSendMessageIntent), so the phone draws it as a
// messaging app's: the sender's photo with a small Club Yuppie icon on it, then who, the plan and the words.
//
// The server (lib/server/messages sendPush) marks chat notifications "mutable-content" and adds:
//   sender: { id, name, photo? }   photo: a signed URL to the sender's photo that runs out in 10 minutes
//   chat:   { id, name }           name: the plan the chat is about
// Every chat is drawn as a group named after its plan, so a plan chat and a question to the host read the same.
// Anything else, or anything that goes wrong (no photo, a slow connection, the photo too late), shows the
// notification as the server wrote it, with the app icon. iOS gives an extension about 30 seconds; the photo gets 8.

final class NotificationService: UNNotificationServiceExtension {
    private let lock = NSLock()
    private var contentHandler: ((UNNotificationContent) -> Void)?
    private var original: UNNotificationContent?
    private var download: URLSessionDataTask?

    override func didReceive(_ request: UNNotificationRequest, withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
        lock.lock()
        self.contentHandler = contentHandler
        original = request.content
        lock.unlock()

        let info = request.content.userInfo
        guard let sender = info["sender"] as? [String: Any],
              let senderId = sender["id"] as? String, !senderId.isEmpty,
              let senderName = sender["name"] as? String, !senderName.isEmpty,
              let chat = info["chat"] as? [String: Any],
              let chatId = chat["id"] as? String, !chatId.isEmpty
        else {
            finish(request.content)
            return
        }
        let chatName = (chat["name"] as? String) ?? ""
        let content = request.content
        let draw = { (photo: Data?) -> UNNotificationContent in
            Self.conversation(content, senderId: senderId, senderName: senderName, chatId: chatId, chatName: chatName, photo: photo)
        }

        guard let link = sender["photo"] as? String, let url = URL(string: link), url.scheme == "https" else {
            finish(draw(nil))
            return
        }
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 8
        config.timeoutIntervalForResource = 8
        let session = URLSession(configuration: config)
        let task = session.dataTask(with: url) { [weak self] data, response, _ in
            let fine = (response as? HTTPURLResponse).map { (200..<300).contains($0.statusCode) } ?? false
            let photo = fine ? data.flatMap { $0.isEmpty || $0.count > 5_000_000 ? nil : $0 } : nil
            self?.finish(draw(photo))
        }
        lock.lock()
        download = task
        lock.unlock()
        task.resume()
        session.finishTasksAndInvalidate()
    }

    override func serviceExtensionTimeWillExpire() {
        lock.lock()
        let task = download
        let content = original
        lock.unlock()
        task?.cancel()
        if let content { finish(content) }
    }

    /// Hand iOS the notification once (the photo's answer and the time running out can race).
    private func finish(_ content: UNNotificationContent) {
        lock.lock()
        let handler = contentHandler
        contentHandler = nil
        lock.unlock()
        handler?(content)
    }

    /// The notification as a message in a group named after the plan, from the sender, with their photo.
    private static func conversation(_ content: UNNotificationContent, senderId: String, senderName: String, chatId: String, chatName: String, photo: Data?) -> UNNotificationContent {
        let image = photo.map { INImage(imageData: $0) }
        let sender = INPerson(
            personHandle: INPersonHandle(value: senderId, type: .unknown),
            nameComponents: nil,
            displayName: senderName,
            image: image,
            contactIdentifier: nil,
            customIdentifier: senderId
        )
        let me = INPerson(
            personHandle: INPersonHandle(value: "me", type: .unknown),
            nameComponents: nil,
            displayName: nil,
            image: nil,
            contactIdentifier: nil,
            customIdentifier: nil,
            isMe: true
        )
        // iOS draws a conversation as a group when it has a name and more than one other person in it.
        let others = INPerson(
            personHandle: INPersonHandle(value: "chat-\(chatId)", type: .unknown),
            nameComponents: nil,
            displayName: chatName,
            image: nil,
            contactIdentifier: nil,
            customIdentifier: "chat-\(chatId)"
        )
        let group = chatName.isEmpty ? nil : INSpeakableString(spokenPhrase: chatName)
        let intent = INSendMessageIntent(
            recipients: group == nil ? [me] : [me, others],
            outgoingMessageType: .outgoingMessageText,
            content: content.body,
            speakableGroupName: group,
            conversationIdentifier: chatId,
            serviceName: nil,
            sender: sender,
            attachments: nil
        )
        // The group's picture is the sender's photo, so the photo shown is always the person who wrote.
        if let image, group != nil {
            intent.setImage(image, forParameterNamed: \.speakableGroupName)
        }
        let interaction = INInteraction(intent: intent, response: nil)
        interaction.direction = .incoming
        interaction.donate(completion: nil)
        do {
            return try content.updating(from: intent)
        } catch {
            return content
        }
    }
}
