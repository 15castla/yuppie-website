import UIKit

// Bespoke splash-screen loading indicator: a thin stroked ring with a
// partial-opacity "comet" tail, continuously rotating — replaces the
// generic system UIActivityIndicatorView Capacitor's SplashScreen plugin
// would otherwise show (capacitor.config.ts sets showSpinner: false so it
// doesn't also add its own on top of this).
//
// Built from a CAGradientLayer (conic/angular, fading from transparent to
// opaque #1A1A1A around the circle) masked to a stroked circular path, so
// only the ring itself shows the gradient. Rotating the whole masked
// gradient produces the comet effect. Lives directly in
// LaunchScreen.storyboard: SplashScreen.swift (in the @capacitor/ios pod)
// instantiates that storyboard's real, live view controller and keeps it
// on screen for the full launchShowDuration — not a static snapshot — so
// this animates continuously for the whole splash window, no extra
// wiring into the plugin's lifecycle needed.
final class CometSpinnerView: UIView {
    private let gradientLayer = CAGradientLayer()
    private let ringMask = CAShapeLayer()

    private static let strokeColor = UIColor(red: 0x1A / 255, green: 0x1A / 255, blue: 0x1A / 255, alpha: 1)
    private static let lineWidth: CGFloat = 3
    // One full rotation every 1.5s divides launchShowDuration (3000ms)
    // evenly — two clean loops before the splash starts fading out,
    // rather than a loop getting cut off abruptly mid-spin.
    private static let rotationDuration: CFTimeInterval = 1.5

    override init(frame: CGRect) {
        super.init(frame: frame)
        setUp()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setUp()
    }

    private func setUp() {
        backgroundColor = .clear
        isUserInteractionEnabled = false

        gradientLayer.type = .conic
        gradientLayer.colors = [
            Self.strokeColor.withAlphaComponent(0).cgColor,
            Self.strokeColor.withAlphaComponent(0.06).cgColor,
            Self.strokeColor.cgColor,
        ]
        gradientLayer.locations = [0, 0.55, 1]
        // Angular gradients sweep from startPoint to endPoint around
        // center (0.5, 0.5); this orientation puts the bright head at
        // the top with the tail fading away behind it.
        gradientLayer.startPoint = CGPoint(x: 0.5, y: 0.5)
        gradientLayer.endPoint = CGPoint(x: 0.5, y: 0)
        gradientLayer.mask = ringMask

        ringMask.fillColor = UIColor.clear.cgColor
        ringMask.strokeColor = UIColor.black.cgColor
        ringMask.lineCap = .round

        layer.addSublayer(gradientLayer)
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        gradientLayer.frame = bounds

        let radius = (min(bounds.width, bounds.height) - Self.lineWidth) / 2
        let center = CGPoint(x: bounds.midX, y: bounds.midY)
        ringMask.path = UIBezierPath(
            arcCenter: center,
            radius: radius,
            startAngle: 0,
            endAngle: .pi * 2,
            clockwise: true
        ).cgPath
        ringMask.lineWidth = Self.lineWidth
        ringMask.frame = bounds
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        if window != nil {
            startAnimating()
        }
    }

    private func startAnimating() {
        guard layer.animation(forKey: "rotation") == nil else { return }
        let rotation = CABasicAnimation(keyPath: "transform.rotation.z")
        rotation.fromValue = 0
        rotation.toValue = Double.pi * 2
        rotation.duration = Self.rotationDuration
        rotation.repeatCount = .infinity
        rotation.isRemovedOnCompletion = false
        layer.add(rotation, forKey: "rotation")
    }
}
