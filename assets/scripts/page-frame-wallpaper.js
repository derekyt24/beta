(() => {
    const body = document.body;
    const frame = document.getElementById('page-scroll');
    if (!body?.classList.contains('page-framed-wallpaper') || !frame) return;

    const mobileViewport = window.matchMedia('(max-width: 600px)');
    const originalBackgroundImage = body.style.getPropertyValue('background-image');
    const originalBackgroundPriority = body.style.getPropertyPriority('background-image');
    let bodyBackgroundIsAdjusted = false;

    function restoreBodyBackground() {
        if (!bodyBackgroundIsAdjusted) return;
        if (originalBackgroundImage) {
            body.style.setProperty('background-image', originalBackgroundImage, originalBackgroundPriority);
        } else {
            body.style.removeProperty('background-image');
        }
        bodyBackgroundIsAdjusted = false;
    }

    function syncWallpaperFrame() {
        restoreBodyBackground();
        const bodyStyle = window.getComputedStyle(body);
        const wallpaper = bodyStyle.backgroundImage !== 'none'
            ? bodyStyle.backgroundImage
            : window.getComputedStyle(body, '::before').backgroundImage;

        frame.style.setProperty('--page-frame-background-image', wallpaper || 'none');
        frame.style.setProperty('--page-frame-background-color', bodyStyle.backgroundColor);
        frame.style.setProperty('--page-frame-background-position', bodyStyle.backgroundPosition);
        frame.style.setProperty('--page-frame-background-size', bodyStyle.backgroundSize);
        frame.style.setProperty('--page-frame-background-repeat', bodyStyle.backgroundRepeat);

        if (mobileViewport.matches) {
            frame.style.setProperty('background-image', wallpaper || 'none', 'important');
            body.style.setProperty(
                'background-image',
                `linear-gradient(var(--page-frame-outside-tint), var(--page-frame-outside-tint)), ${wallpaper || 'none'}`,
                'important'
            );
            bodyBackgroundIsAdjusted = true;
        } else {
            frame.style.removeProperty('background-image');
        }
    }

    syncWallpaperFrame();
    window.addEventListener('resize', syncWallpaperFrame);
    mobileViewport.addEventListener?.('change', syncWallpaperFrame);
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', syncWallpaperFrame);
})();
