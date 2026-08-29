export type DeviceType = "desktop" | "mobile" | "tablet";

export interface DeviceCheck {
  allowed: boolean;
  deviceType: DeviceType;
  reason?: string;
}

/**
 * Detects the device type from user agent + hardware signals.
 * Interviews require a desktop/laptop with webcam and microphone —
 * mobile devices are blocked because proctoring cannot run reliably.
 */
export function detectDevice(): DeviceCheck {
  const ua = navigator.userAgent || "";

  const isMobileUA = /Android|iPhone|iPod|Windows Phone|webOS|BlackBerry|Opera Mini|IEMobile/i.test(ua);
  // iPad on iOS 13+ masquerades as Mac — use touch signal to catch it
  const isIPad = /iPad/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  const isTabletUA = /Tablet|PlayBook|Silk/i.test(ua) || isIPad;

  const coarsePointer = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  const noHover = window.matchMedia?.("(hover: none)")?.matches ?? false;
  const smallScreen = Math.min(window.screen?.width ?? 1024, window.screen?.height ?? 768) < 768;

  if (isMobileUA || (coarsePointer && noHover && smallScreen)) {
    return {
      allowed: false,
      deviceType: "mobile",
      reason:
        "Interviews must be taken on a desktop or laptop with a working webcam and microphone. Mobile phones are not permitted because the proctoring system (fullscreen lock, tab-switch detection, webcam monitoring) requires a desktop browser.",
    };
  }

  if (isTabletUA) {
    return {
      allowed: false,
      deviceType: "tablet",
      reason:
        "Interviews must be taken on a desktop or laptop. Tablets are not supported by the proctoring system.",
    };
  }

  return { allowed: true, deviceType: "desktop" };
}
