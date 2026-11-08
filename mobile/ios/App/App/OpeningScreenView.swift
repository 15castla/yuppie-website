import UIKit

// The app's opening screen ("On the rule", Albert's pick on 1 Nov 2026): the wordmark, "Your social life, sorted." and
// the three figures, standing on a 3pt ink line that runs the full width of the screen. While the app loads, the line
// draws itself from the left: quickly past the figures' feet, then slowly on, and it completes when the first page is
// ready (finish), just before the screen fades. It replaces the comet ring that used to spin around the wordmark.
//
// The wordmark, tagline and figures are the Splash image (Assets.xcassets/Splash.imageset), the same image
// LaunchScreen.storyboard shows before any of this code runs, so there is no seam when this view takes over from the
// system's launch screen: its first frame is the same picture, with no line yet. The line has to move, so it can't be
// in the image; it is drawn here, exactly where the image has the figures' shoes.
//
// Where the shoes are on screen: the image is a 2732 px square shown aspect-fill (scaled by the screen's longer side,
// centred, the other side cropped evenly), so a row y of the image lands at
//     midY + (y - 1366) * max(width, height) / 2732
// whatever the device or orientation, and whichever of the image's @1x/@2x/@3x files is loaded (they are the same
// 2732 px picture). The two pictures are mobile/assets/opening-on-the-rule.png (upright) and
// opening-on-the-rule-landscape.png (the same composition at 0.62, for an iPhone on its side: Apple's compact height,
// which the asset catalog and so the launch screen serve then); scripts/build-splash.cjs copies them into the asset
// catalog. Measured in them, the shoes' bottom edges (where ink of at least half strength ends) are at rows 2168 to
// 2170 upright and 1842 to 1843 sideways. The line's top edge sits half an image pixel above the highest of those and
// is then moved up to the screen's pixel grid, never down, so every shoe touches the line and none floats over it
// (checked in the cloud at 18 iPhone, iPad and window sizes: 0 to 2pt of shoe under the line, never a gap).
// If either picture changes, measure again and change these numbers with it.
final class OpeningScreenView: UIView {
    private struct Layout {
        let ruleTop: CGFloat    // the line's top edge, in rows of the 2732 px image
        let lineWidth: CGFloat  // points
    }

    private static let canvasSide: CGFloat = 2732
    private static let upright = Layout(ruleTop: 2167.5, lineWidth: 3)
    // The sideways picture is the same composition at 0.62 of the size, so its line is thinner too.
    private static let sideways = Layout(ruleTop: 1841.5, lineWidth: 2)
    private static let yellow = UIColor(red: 1.0, green: 0.8509803921568627, blue: 0.01568627450980392, alpha: 1.0)
    private static let ink = UIColor(red: 0x1B / 255, green: 0x15 / 255, blue: 0x12 / 255, alpha: 1)
    // --foreground-muted in app/globals.css, as on the offline screen.
    private static let muted = UIColor(red: 0x6B / 255, green: 0x65 / 255, blue: 0x60 / 255, alpha: 1)

    private let imageView = UIImageView()
    private let line = CAShapeLayer()
    private var showingSideways: Bool?
    private var started = false
    private var finishing = false
    private var finished = false
    private var whenFinished: [() -> Void] = []

    // "Still loading." (Albert, 8 Nov 2026, a fresh install on train wifi: the opening screen finished, then a plain
    // yellow page). SceneDelegate shows it after 20s with the page still not there: the heading, "Your connection looks
    // slow." and a Try again button in the website's message style (heavy heading, muted line, an ink pill), centred
    // above the home indicator, under the figures' line on every upright iPhone and iPad (sized for the iPhone SE's
    // room under it: 114pt). On a yellow panel, so it reads where it does cover the picture (an iPhone on its side).
    private let stillLoading = UIStackView()
    private var onRetry: (() -> Void)?

    override init(frame: CGRect) {
        super.init(frame: frame)
        setUp()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setUp()
    }

    private func setUp() {
        // Touches go through to the web view underneath (point(inside:with:)), except on "Still loading.".
        isUserInteractionEnabled = true
        backgroundColor = Self.yellow
        imageView.contentMode = .scaleAspectFill
        imageView.clipsToBounds = true
        imageView.frame = bounds
        imageView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        addSubview(imageView)

        line.strokeColor = Self.ink.cgColor
        line.fillColor = nil
        line.lineCap = .butt
        line.strokeEnd = 0
        layer.addSublayer(line)

        setUpStillLoading()
    }

    private func setUpStillLoading() {
        let heading = UILabel()
        heading.text = "Still loading."
        heading.font = .systemFont(ofSize: 20, weight: .heavy)
        heading.textColor = Self.ink
        heading.textAlignment = .center
        heading.accessibilityTraits = .header

        let detail = UILabel()
        detail.text = "Your connection looks slow."
        detail.font = .systemFont(ofSize: 15)
        detail.textColor = Self.muted
        detail.textAlignment = .center
        detail.numberOfLines = 0

        var look = UIButton.Configuration.filled()
        look.baseBackgroundColor = Self.ink
        look.baseForegroundColor = Self.yellow
        look.cornerStyle = .capsule
        look.contentInsets = NSDirectionalEdgeInsets(top: 0, leading: 28, bottom: 0, trailing: 28)
        var titleFont = AttributeContainer()
        titleFont.font = UIFont.systemFont(ofSize: 16, weight: .bold)
        look.attributedTitle = AttributedString("Try again", attributes: titleFont)
        let button = UIButton(configuration: look)
        button.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
        button.addAction(UIAction { [weak self] _ in self?.onRetry?() }, for: .touchUpInside)

        stillLoading.axis = .vertical
        stillLoading.alignment = .center
        stillLoading.spacing = 4
        stillLoading.addArrangedSubview(heading)
        stillLoading.addArrangedSubview(detail)
        stillLoading.setCustomSpacing(12, after: detail)
        stillLoading.addArrangedSubview(button)
        stillLoading.backgroundColor = Self.yellow
        stillLoading.isLayoutMarginsRelativeArrangement = true
        stillLoading.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 6, leading: 16, bottom: 6, trailing: 16)
        stillLoading.translatesAutoresizingMaskIntoConstraints = false
        stillLoading.alpha = 0
        stillLoading.isHidden = true
        addSubview(stillLoading)
        NSLayoutConstraint.activate([
            stillLoading.centerXAnchor.constraint(equalTo: centerXAnchor),
            stillLoading.leadingAnchor.constraint(greaterThanOrEqualTo: safeAreaLayoutGuide.leadingAnchor, constant: 8),
            stillLoading.trailingAnchor.constraint(lessThanOrEqualTo: safeAreaLayoutGuide.trailingAnchor, constant: -8),
            stillLoading.bottomAnchor.constraint(equalTo: safeAreaLayoutGuide.bottomAnchor, constant: -8)
        ])
        // Above the line's layer.
        stillLoading.layer.zPosition = 1
    }

    func showStillLoading(onRetry: @escaping () -> Void) {
        self.onRetry = onRetry
        let wasHidden = stillLoading.isHidden || stillLoading.alpha == 0
        stillLoading.isHidden = false
        UIView.animate(withDuration: 0.3) { self.stillLoading.alpha = 1 }
        if wasHidden { UIAccessibility.post(notification: .screenChanged, argument: stillLoading) }
    }

    func hideStillLoading() {
        guard !stillLoading.isHidden else { return }
        UIView.animate(withDuration: 0.2, animations: { self.stillLoading.alpha = 0 }, completion: { _ in
            // Not if it was shown again meanwhile.
            if self.stillLoading.alpha == 0 { self.stillLoading.isHidden = true }
        })
    }

    // Touches go through to the web view underneath (as they did with the old splash image), except on "Still
    // loading." while it shows.
    override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
        guard !stillLoading.isHidden, stillLoading.alpha > 0 else { return false }
        return stillLoading.frame.contains(point)
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        // Asked again on every layout, so turning an iPhone on its side swaps both the picture and the line's place.
        // The sideways picture also serves any window much wider than it is tall (an iPad app in a short window, or on
        // an external display): past about 1.6:1 the upright picture's feet sit too low, and from 1.7:1 off screen.
        // Full-screen iPads go up to 1.52:1 (iPad mini on its side) and keep the upright picture, as the launch screen
        // does. The asset is asked for by size class alone, so it is the variant chosen here, not the window's own.
        let sideways = traitCollection.verticalSizeClass == .compact || bounds.width > bounds.height * 1.55
        if sideways != showingSideways {
            showingSideways = sideways
            let traits = UITraitCollection(verticalSizeClass: sideways ? .compact : .regular)
            let picked = UIImage(named: "Splash", in: Bundle.main, compatibleWith: traits)
            // Detached from the asset catalog, so the image view can't swap in the variant for its own traits (which
            // in a wide window would put the upright picture over the sideways line). Swaps happen here instead.
            if let picked, let bitmap = picked.cgImage {
                imageView.image = UIImage(cgImage: bitmap, scale: picked.scale, orientation: .up)
            } else {
                imageView.image = picked
            }
        }
        let layout = sideways ? Self.sideways : Self.upright
        let scale = max(bounds.width, bounds.height) / Self.canvasSide
        let pixel = 1 / max(traitCollection.displayScale, 1)
        let exactTop = bounds.midY + (layout.ruleTop - Self.canvasSide / 2) * scale
        let top = (exactTop / pixel).rounded(.down) * pixel
        let y = top + layout.lineWidth / 2

        let path = UIBezierPath()
        path.move(to: CGPoint(x: bounds.minX, y: y))
        path.addLine(to: CGPoint(x: bounds.maxX, y: y))
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        line.frame = bounds
        line.lineWidth = layout.lineWidth
        line.path = path.cgPath
        CATransaction.commit()
    }

    // A size class or screen scale can change without the size changing (and before iOS 18 that doesn't lay out again).
    override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
        super.traitCollectionDidChange(previousTraitCollection)
        if previousTraitCollection?.verticalSizeClass != traitCollection.verticalSizeClass
            || previousTraitCollection?.displayScale != traitCollection.displayScale {
            setNeedsLayout()
        }
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        guard window != nil, !started else { return }
        started = true
        startDrawing()
    }

    // 0 to 85% of the width in 1.1s (the design's draw curve), past the figures' feet on every full-screen device; then
    // on to 97% over the next 8.9s, so a slow start still shows the app is working, and it waits there if the page takes
    // longer (SceneDelegate keeps this screen until the page can be seen, and says "Still loading." after 20s). With
    // Reduce Motion on, the line is simply there.
    private func startDrawing() {
        if UIAccessibility.isReduceMotionEnabled {
            CATransaction.begin()
            CATransaction.setDisableActions(true)
            line.strokeEnd = 1
            CATransaction.commit()
            return
        }
        let draw = CAKeyframeAnimation(keyPath: "strokeEnd")
        draw.values = [0, 0.85, 0.97]
        draw.keyTimes = [0, NSNumber(value: 1.1 / 10), 1]
        draw.timingFunctions = [
            CAMediaTimingFunction(controlPoints: 0.2, 0.7, 0.2, 1),
            CAMediaTimingFunction(name: .easeOut)
        ]
        draw.duration = 10
        // Kept (not removed) if the app goes to the background mid-launch, so the line carries on when it comes back.
        draw.isRemovedOnCompletion = false
        draw.fillMode = .forwards
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        line.strokeEnd = 0.97
        CATransaction.commit()
        line.add(draw, forKey: "draw")
    }

    // The first page is ready: the line runs out to the right-hand edge from wherever it has got to, then completion
    // runs (SceneDelegate fades this view out). Quick: 0.15s to 0.35s, depending on how far the line still has to go.
    // Safe in any order: before the view is on screen it completes at once, and every caller's completion runs once.
    func finish(then completion: @escaping () -> Void) {
        if finished {
            completion()
            return
        }
        whenFinished.append(completion)
        guard !finishing else { return }
        finishing = true
        started = true
        let now = line.presentation()?.strokeEnd ?? line.strokeEnd
        line.removeAnimation(forKey: "draw")
        guard window != nil, now < 1 else {
            CATransaction.begin()
            CATransaction.setDisableActions(true)
            line.strokeEnd = 1
            CATransaction.commit()
            completeFinish()
            return
        }
        let rest = CABasicAnimation(keyPath: "strokeEnd")
        rest.fromValue = now
        rest.toValue = 1
        rest.duration = max(0.15, 0.35 * Double(1 - now))
        rest.timingFunction = CAMediaTimingFunction(name: .easeOut)
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        // Core Animation calls this even if the animation is cut short (the app going to the background).
        CATransaction.setCompletionBlock { [self] in completeFinish() }
        line.strokeEnd = 1
        line.add(rest, forKey: "finish")
        CATransaction.commit()
    }

    private func completeFinish() {
        guard !finished else { return }
        finished = true
        let completions = whenFinished
        whenFinished = []
        completions.forEach { $0() }
    }
}
