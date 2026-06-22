import { useEffect } from 'react';

// iOS Safari intercepts swipes starting within ~20px of the left edge as a
// back-navigation gesture. We skip that zone to avoid conflict.
const IOS_BACK_ZONE   = 20; // px — leave this to the OS
const LEFT_ZONE       = 80; // px — our swipe-open target starts past the iOS zone
const RIGHT_THRESHOLD = 28; // px from right edge for left-swipe detection
const SWIPE_THRESHOLD = 50; // minimum horizontal travel to fire callback

export function useSwipeGesture(ref, { onSwipeRight, onSwipeLeft } = {}) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let startX = 0;
    let startY = 0;
    let fromLeftEdge  = false;
    let fromRightEdge = false;

    const onTouchStart = (e) => {
      const touch = e.touches[0];
      startX        = touch.clientX;
      startY        = touch.clientY;
      fromLeftEdge  = startX > IOS_BACK_ZONE && startX <= LEFT_ZONE;
      fromRightEdge = startX >= window.innerWidth - RIGHT_THRESHOLD;
    };

    const onTouchEnd = (e) => {
      const touch  = e.changedTouches[0];
      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;

      // Ignore primarily-vertical movement (user is scrolling)
      if (Math.abs(deltaY) > Math.abs(deltaX)) return;

      if (fromLeftEdge  && deltaX >  SWIPE_THRESHOLD) onSwipeRight?.();
      if (fromRightEdge && deltaX < -SWIPE_THRESHOLD)  onSwipeLeft?.();
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchend',   onTouchEnd,   { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchend',   onTouchEnd);
    };
  }, [ref, onSwipeRight, onSwipeLeft]);
}
