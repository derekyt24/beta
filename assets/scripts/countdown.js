            (() => {
                const countdown = document.getElementById('announcement-countdown');
                if (!countdown) return;

                const targetTime = new Date(countdown.dataset.target).getTime();
                if (!Number.isFinite(targetTime)) return;

                const values = Object.fromEntries(
                    [...countdown.querySelectorAll('[data-unit]')].map((item) => [item.dataset.unit, item])
                );
                Object.values(values).forEach((element) => element.replaceChildren());
                const announcementLink = document.createElement('a');
                announcementLink.href = '/asset-directory.html';
                announcementLink.textContent = 'Click here to explore';
                let timer = null;

                function updateCountdown() {
                    const remaining = targetTime - Date.now();
                    countdown.hidden = false;
                    if (remaining <= 0) {
                        countdown.querySelector('.countdown-units').replaceWith(announcementLink);
                        countdown.querySelector('.announcement-countdown-title').textContent = 'Now available: an asset directory.';
                        if (timer !== null) window.clearInterval(timer);
                        return;
                    }

                    const totalSeconds = Math.floor(remaining / 1000);
                    const nextValues = {
                        days: String(Math.floor(totalSeconds / 86400)),
                        hours: String(Math.floor((totalSeconds % 86400) / 3600)).padStart(2, '0'),
                        minutes: String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0'),
                        seconds: String(totalSeconds % 60).padStart(2, '0')
                    };

                    Object.entries(nextValues).forEach(([unit, nextValue]) => {
                        const element = values[unit];
                        if (element.dataset.value === nextValue) return;
                        element.style.width = `${Math.max(1, nextValue.length)}ch`;

                        const previousDigit = element.querySelector('.countdown-digit:not(.outgoing)');
                        if (previousDigit) {
                            if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                                previousDigit.remove();
                            } else {
                                previousDigit.classList.add('outgoing');
                                window.setTimeout(() => previousDigit.remove(), 450);
                            }
                        }

                        const nextDigit = document.createElement('span');
                        nextDigit.className = 'countdown-digit';
                        nextDigit.textContent = nextValue;
                        element.append(nextDigit);
                        element.dataset.value = nextValue;
                    });
                }

                updateCountdown();
                if (targetTime > Date.now()) {
                    timer = window.setInterval(updateCountdown, 1000);
                }
            })();