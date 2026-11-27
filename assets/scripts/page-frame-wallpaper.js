(() => {
    const body = document.body;
    const frame = document.getElementById('page-scroll');
    if (!body?.classList.contains('page-framed-wallpaper') || !frame) return;

    const mobileViewport = window.matchMedia('(max-width: 600px)');
    const originalBodyBackgroundImage = body.style.getPropertyValue('background-image');
    const originalBodyBackgroundPriority = body.style.getPropertyPriority('background-image');
    let bodyBackgroundIsAdjusted = false;
    let frameBackgroundIsAdjusted = false;

    function restoreAdjustedBackgrounds() {
        if (bodyBackgroundIsAdjusted) {
            if (originalBodyBackgroundImage) {
                body.style.setProperty('background-image', originalBodyBackgroundImage, originalBodyBackgroundPriority);
            } else {
                body.style.removeProperty('background-image');
            }
            bodyBackgroundIsAdjusted = false;
        }

        if (frameBackgroundIsAdjusted) {
            frame.style.removeProperty('background-image');
            frameBackgroundIsAdjusted = false;
        }
    }

    function syncWallpaperFrame() {
        restoreAdjustedBackgrounds();

        const bodyStyle = window.getComputedStyle(body);
        const beforeStyle = window.getComputedStyle(body, '::before');
        const frameStyle = window.getComputedStyle(frame);
        const isMobile = mobileViewport.matches;
        const bodyWallpaper = bodyStyle.backgroundImage !== 'none'
            ? bodyStyle.backgroundImage
            : beforeStyle.backgroundImage;
        const frameWallpaper = frameStyle.backgroundImage !== 'none'
            ? frameStyle.backgroundImage
            : 'none';
        const configuredWallpaper = bodyStyle.getPropertyValue(
            isMobile ? '--page-frame-background-mobile' : '--page-frame-background'
        ).trim();
        const wallpaper = isMobile
            ? (frameWallpaper !== 'none' ? frameWallpaper : bodyWallpaper !== 'none' ? bodyWallpaper : configuredWallpaper || 'none')
            : (bodyWallpaper !== 'none' ? bodyWallpaper : frameWallpaper);
        const wallpaperStyle = isMobile && frameWallpaper !== 'none'
            ? frameStyle
            : bodyStyle.backgroundImage !== 'none'
                ? bodyStyle
                : beforeStyle.backgroundImage !== 'none'
                    ? beforeStyle
                    : bodyStyle;
        frame.style.setProperty('--page-frame-background-image', wallpaper || 'none');
        frame.style.setProperty('--page-frame-background-color', bodyStyle.backgroundColor);
        frame.style.setProperty('--page-frame-background-position', wallpaperStyle.backgroundPosition);
        frame.style.setProperty('--page-frame-background-size', wallpaperStyle.backgroundSize);
        frame.style.setProperty('--page-frame-background-repeat', wallpaperStyle.backgroundRepeat);

        if (!isMobile) return;

        if (wallpaper !== 'none') {
            frame.style.setProperty('background-image', wallpaper, 'important');
            frameBackgroundIsAdjusted = true;
        }

        body.style.setProperty('background-image', 'none', 'important');
        bodyBackgroundIsAdjusted = true;
    }

    syncWallpaperFrame();
    window.addEventListener('resize', syncWallpaperFrame);
    mobileViewport.addEventListener?.('change', syncWallpaperFrame);
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', syncWallpaperFrame);
})();
