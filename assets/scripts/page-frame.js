(() => {
    const body = document.body;
    const frame = document.getElementById('page-scroll');
    if (!body?.classList.contains('page-framed') || !frame) return;
    if (body.classList.contains('page-framed-wallpaper')) return;

    const mobileViewport = window.matchMedia('(max-width: 600px)');
    const originalBackgroundImage = body.style.getPropertyValue('background-image');
    const originalBackgroundPriority = body.style.getPropertyPriority('background-image');
    let bodyBackgroundIsSuppressed = false;

    function restoreBodyBackground() {
        if (!bodyBackgroundIsSuppressed) return;
        if (originalBackgroundImage) {
            body.style.setProperty('background-image', originalBackgroundImage, originalBackgroundPriority);
        } else {
            body.style.removeProperty('background-image');
        }
        bodyBackgroundIsSuppressed = false;
    }

    function syncFrame() {
        restoreBodyBackground();

        const bodyStyle = window.getComputedStyle(body);
        const beforeStyle = window.getComputedStyle(body, '::before');
        const backgroundImage = bodyStyle.backgroundImage !== 'none'
            ? bodyStyle.backgroundImage
            : beforeStyle.backgroundImage;

        frame.style.setProperty('--page-frame-background-image', backgroundImage || 'none');
        frame.style.setProperty('--page-frame-background-color', bodyStyle.backgroundColor);
        frame.style.setProperty('--page-frame-background-position', bodyStyle.backgroundPosition);
        frame.style.setProperty('--page-frame-background-size', bodyStyle.backgroundSize);
        frame.style.setProperty('--page-frame-background-repeat', bodyStyle.backgroundRepeat);

        const beforeColor = beforeStyle.backgroundColor;
        if (beforeColor && beforeColor !== 'rgba(0, 0, 0, 0)' && beforeColor !== 'transparent') {
            frame.style.setProperty('--page-frame-tint', beforeColor);
        } else {
            frame.style.removeProperty('--page-frame-tint');
        }

        if (mobileViewport.matches) {
            body.style.setProperty('background-image', 'none', 'important');
            bodyBackgroundIsSuppressed = true;
        }
    }

    syncFrame();
    window.addEventListener('resize', syncFrame);
    mobileViewport.addEventListener?.('change', syncFrame);
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', syncFrame);
})();
