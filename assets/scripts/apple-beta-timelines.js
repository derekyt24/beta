(() => {
    const transitionDuration = 150;
    const transitionStates = new WeakMap();

    function fadeAndRenderVersion(select, state) {
        state.busy = true;
        state.queued = false;

        state.elements.forEach(({ element }) => {
            element.style.transition = `opacity ${transitionDuration}ms ease`;
            element.style.opacity = "0";
        });

        window.setTimeout(() => {
            // The replay uses the page's existing renderer with the latest selection.
            state.queued = false;
            state.replaying = true;
            select.dispatchEvent(new Event("change", { bubbles: true }));

            state.elements.forEach(({ element, visibleOpacity }) => {
                // Commit the newly rendered content at opacity 0 before fading it back in.
                void element.offsetWidth;
                element.style.opacity = visibleOpacity;
            });

            window.setTimeout(() => {
                state.elements.forEach(({ element, opacity, transition }) => {
                    element.style.opacity = opacity;
                    element.style.transition = transition;
                });

                state.busy = false;
                if (state.queued) {
                    fadeAndRenderVersion(select, state);
                } else {
                    transitionStates.delete(select);
                }
            }, transitionDuration);
        }, transitionDuration);
    }

    document.addEventListener("change", event => {
        const select = event.target;
        if (!select || select.tagName !== "SELECT" || select.id !== "software-version") return;

        const existingState = transitionStates.get(select);
        if (existingState?.replaying) {
            existingState.replaying = false;
            return;
        }

        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

        const releaseGrid = document.getElementById("release-grid");
        if (!releaseGrid) return;

        event.stopImmediatePropagation();
        const state = existingState || {
            busy: false,
            queued: false,
            replaying: false,
            elements: [releaseGrid, document.getElementById("timeline-footnote")]
                .filter(Boolean)
                .map(element => ({
                    element,
                    opacity: element.style.opacity,
                    transition: element.style.transition,
                    visibleOpacity: window.getComputedStyle(element).opacity
                }))
        };

        if (!existingState) transitionStates.set(select, state);
        if (state.busy) {
            state.queued = true;
            return;
        }

        fadeAndRenderVersion(select, state);
    }, true);

    function initializeTimelinePage(timelines) {
        const versionSelect = document.getElementById("software-version");
        const releaseGrid = document.getElementById("release-grid");
        const timelineFootnote = document.getElementById("timeline-footnote");
        const timelineIntro = document.querySelector("#timeline-intro, #timeline-intro-mac");

        function releaseMarkup(release) {
            if (release.trio || release.quad || release.pair) {
                const layout = release.trio ? "trio" : release.quad ? "quad" : "pair";
                const className = release.className ? ` ${release.className}` : "";
                return `<div class="release-${layout}${className}">${release[layout].map(releaseMarkup).join("")}</div>`;
            }

            const spanClass = release.spanTwo ? " span-two" : "";
            const alignmentClass = release.alignment ? ` release-align-${release.alignment}` : "";
            const name = release.name ? `<p class="release-name">${release.name}</p>` : "";
            const note = release.note ? `<p class="release-note">${release.note}</p>` : "";
            return `<article class="release${spanClass}${alignmentClass}">
                ${name}
                <p class="release-date">${release.date}</p>${note}
            </article>`;
        }

        function renderTimeline() {
            const timeline = timelines[versionSelect.value];

            if (!timeline) {
                releaseGrid.setAttribute("aria-label", "Timeline coming soon");
                releaseGrid.innerHTML = '<p class="timeline-message span-two">This timeline is coming soon.</p>';
                if (timelineIntro) {
                    timelineIntro.hidden = true;
                    timelineIntro.textContent = "";
                    timelineIntro.classList.remove("timeline-intro-after-supplemental");
                }
                timelineFootnote.hidden = true;
                timelineFootnote.textContent = "";
                return;
            }

            releaseGrid.setAttribute("aria-label", `${timeline.label} release dates`);
            timelineFootnote.textContent = timeline.footnote ?? "";
            timelineFootnote.hidden = !timeline.footnote;
            if (timelineIntro) {
                timelineIntro.textContent = timeline.intro ?? "";
                timelineIntro.hidden = !timeline.intro;
                timelineIntro.classList.toggle(
                    "timeline-intro-after-supplemental",
                    Boolean(timeline.supplemental?.length)
                );
            }
            if (timeline.gridMaxWidth) {
                releaseGrid.style.setProperty("--timeline-grid-max-width", timeline.gridMaxWidth);
            } else {
                releaseGrid.style.removeProperty("--timeline-grid-max-width");
            }

            let markup = timeline.releases.map(releaseMarkup).join("");
            if (timeline.supplemental?.length) {
                markup += `<section class="span-two supplemental" aria-label="Supplemental releases">
                    ${timeline.supplementalIntro ? `<p class="timeline-intro-note supplemental-intro-note">${timeline.supplementalIntro}</p>` : ""}
                    <p class="section-label">${timeline.supplementalLabel ?? "supplemental releases"}</p>
                    ${timeline.supplemental.map(releaseMarkup).join("")}
                </section>`;
            }
            releaseGrid.innerHTML = markup;
        }

        versionSelect.addEventListener("change", renderTimeline);
        renderTimeline();
    }

    const pageInitializers = {
        "index.html": () => {
            const timelineData = {
                    ios: { label: "iOS", versions: ["7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "26", "27"] },
                    ipados: { label: "iPadOS", versions: ["13", "14", "15", "16", "17", "18", "26", "27"] },
                    "os-x": { label: "OS X", versions: ["10.9", "10.10", "10.11"]},
                    macos: { label: "macOS", versions: ["10.12", "10.13", "10.14", "10.15", "11", "12", "13", "14", "15", "26", "27"]},
                    visionos: { label: "visionOS", versions: ["1", "2", "26", "27"] },
                    watchos: { label: "watchOS", versions: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "26", "27" ] },
                    tvos: { label: "tvOS", versions: ["9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "26", "27" ] },
                };
            
                const picker = document.getElementById("timeline-picker");
                const platformSelect = document.getElementById("platform");
                const versionSelect = document.getElementById("version");
                const goButton = picker.querySelector("button");
            
                function versionSlug(platform, version) {
                    const normalizedVersion = version.replace(".", "-");
                    if (platform === "macos" && ["10.9", "10.10", "10.11"].includes(version)) {
                        return `os-x-${normalizedVersion}`;
                    }
                    return `${platform}-${normalizedVersion}`;
                }
            
                function updateVersions() {
                    const platform = platformSelect.value;
                    versionSelect.replaceChildren(new Option("Choose a version", ""));
                    versionSelect.disabled = !platform;
                    goButton.disabled = true;
            
                    if (!platform) return;
            
                    const { label, versions } = timelineData[platform];
                    versions.forEach((version) => {
                        versionSelect.add(new Option(`${label} ${version}`, version));
                    });
                }
            
                platformSelect.addEventListener("change", updateVersions);
                versionSelect.addEventListener("change", () => {
                    goButton.disabled = !versionSelect.value;
                });
            
                picker.addEventListener("submit", (event) => {
                    event.preventDefault();
                    if (!platformSelect.value || !versionSelect.value) return;
                    window.location.assign(`/projects/apple-beta-timelines/${versionSlug(platformSelect.value, versionSelect.value)}`);
                });
        },
        "credits.html": () => {
            const timelines = {
                        "credits": {
                            label: "Credits",
                            intro: "All @handles are for X (Twitter).",
                            releases: [
                                {
                                    pair: [
                                        { name: "creator + co-lead", date: "DerekYT", note: "@derekyt_" },
                                        { name: "co-lead", date: "That Josh Guy", note: "@thatjoshguy" },
                                    ],
                                    className: "release-pair-tight"
                                },
                                { name: "contributor", date: "SLK15", note: "@SLKVinyl", spanTwo: true },
                                { name: "all release data", date: "AppleDB", note: "appledb.dev", spanTwo: true },
                                { 
                                    pair: [
                                        { name: "visionOS 2 + 26 backgrounds", date: "Remo Pro", note: "@Remo_Pr0" },
                                        { name: "Apple Intelligence wallpapers", date: "Basic Apple Guy", note: "@BasicAppleGuy or basicappleguy.com" },
                                    ],
                                    className: "release-pair-tight"
                                 },
                            ],
                        },
                    };
            initializeTimelinePage(timelines);
        },        
        "ios-10.html": () => {
            const timelines = {
                        "10-0": {
                            label: "iOS 10-0",
                            footnote: "1: Released only for iPhone 7 and 7 Plus.",
                            releases: [
                                { name: "iOS 10.0 beta 1", date: "June 13, 2016", alignment: "left" },
                                { name: "iOS 10.0 beta 2", date: "July 5, 2016", alignment: "right" },
                                { name: "iOS 10.0 beta 3", date: "July 18, 2016", alignment: "left" },
                                { name: "iOS 10.0 beta 4", date: "August 1, 2016", alignment: "right" },
                                { name: "iOS 10.0 beta 5", date: "August 9, 2016", alignment: "left" },
                                { name: "iOS 10.0 beta 6", date: "August 15, 2016", alignment: "right" },
                                { name: "iOS 10.0 beta 7", date: "August 19, 2016", alignment: "left" },
                                { name: "iOS 10.0 beta 8", date: "August 26, 2016", alignment: "right" },
                                {
                                    pair: [
                                        { name: "iOS 10.0.1 GM build", date: "September 7, 2016" },
                                        { name: "iOS 10.0 + 10.0.1 final build", date: "September 13, 2016" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                {
                                    pair: [
                                        { name: "iOS 10.0.2", date: "September 23, 2016" },
                                        { name: "iOS 10.0.3&#185;", date: "October 17, 2016" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ]
                        },
                        "10-1": {
                            label: "iOS 10.1",
                            releases: [
                                { name: "iOS 10.1 beta 1", date: "September 21, 2016", alignment: "left" },
                                { name: "iOS 10.1 beta 2", date: "October 4, 2016", alignment: "right" },
                                { name: "iOS 10.1 beta 3", date: "October 10, 2016", alignment: "left" },
                                { name: "iOS 10.1 beta 4", date: "October 17, 2016", alignment: "right" },
                                { name: "iOS 10.1 beta 5", date: "October 19, 2016", spanTwo: true },
                                { name: "iOS 10.1 final build", date: "October 24, 2016", spanTwo: true }
                            ],
                            supplemental: [
                                { name: "iOS 10.1.1", date: "October 31, 2016", note: "build 2: November 9, 2016" }
                            ]
                        },
                        "10-2": {
                            label: "iOS 10.2",
                            releases: [
                                { name: "iOS 10.2 beta 1", date: "October 31, 2016", alignment: "left" },
                                { name: "iOS 10.2 beta 2", date: "November 7, 2016", alignment: "right" },
                                { name: "iOS 10.2 beta 3", date: "November 14, 2016", alignment: "left" },
                                { name: "iOS 10.2 beta 4", date: "November 28, 2016", alignment: "right" },
                                { name: "iOS 10.2 beta 5", date: "December 2, 2016", alignment: "left" },
                                { name: "iOS 10.2 beta 6", date: "December 5, 2016", alignment: "right" },
                                { name: "iOS 10.2 beta 7", date: "December 7, 2016", spanTwo: true },
                                { name: "iOS 10.2 final build", date: "December 12, 2016", spanTwo: true }
                            ],
                        },
                        "10-2-1": {
                            label: "iOS 10.2.1",
                            releases: [
                                { name: "iOS 10.2.1 beta 1", date: "December 14, 2016", alignment: "left" },
                                { name: "iOS 10.2.1 beta 2", date: "December 20, 2016", alignment: "right" },
                                { name: "iOS 10.2.1 beta 3", date: "January 9, 2017", alignment: "left" },
                                { name: "iOS 10.2.1 beta 4", date: "January 12, 2017", alignment: "right" },
                                { name: "iOS 10.2.1 final build", date: "January 23, 2017", spanTwo: true }
                            ],
                        },
                        "10-3": {
                            label: "iOS 10.3",
                            releases: [
                                { name: "iOS 10.3 beta 1", date: "January 24, 2017", alignment: "left" },
                                { name: "iOS 10.3 beta 2", date: "February 6, 2017", alignment: "right" },
                                { name: "iOS 10.3 beta 3", date: "February 20, 2017", alignment: "left" },
                                { name: "iOS 10.3 beta 4", date: "February 27, 2017", alignment: "right" },
                                { name: "iOS 10.3 beta 5", date: "March 8, 2017", alignment: "left" },
                                { name: "iOS 10.3 beta 6", date: "March 13, 2017", alignment: "right" },
                                { name: "iOS 10.3 beta 7", date: "March 16, 2017", spanTwo: true },
                                { name: "iOS 10.3 final build", date: "March 27, 2017", spanTwo: true }
                            ],
                            supplemental: [
                                { name: "iOS 10.3.1", date: "April 3, 2017" }
                            ]
                        },
                        "10-3-2": {
                            label: "iOS 10.3.2",
                            releases: [
                                { name: "iOS 10.3.2 beta 1", date: "March 28, 2017", alignment: "left" },
                                { name: "iOS 10.3.2 beta 2", date: "April 10, 2017", alignment: "right" },
                                { name: "iOS 10.3.2 beta 3", date: "April 17, 2017", alignment: "left" },
                                { name: "iOS 10.3.2 beta 4", date: "April 24, 2017", alignment: "right" },
                                { name: "iOS 10.3.2 beta 5", date: "April 27, 2017", spanTwo: true },
                                { name: "iOS 10.3.2 final build", date: "May 15, 2017", spanTwo: true }
                            ],
                        },
                        "10-3-3": {
                            label: "iOS 10.3.3",
                            releases: [
                                { name: "iOS 10.3.3 beta 1", date: "May 16, 2017", alignment: "left" },
                                { name: "iOS 10.3.3 beta 2", date: "May 30, 2017", alignment: "right" },
                                { name: "iOS 10.3.3 beta 3", date: "June 13, 2017", alignment: "left" },
                                { name: "iOS 10.3.3 beta 4", date: "June 22, 2017", alignment: "right" },
                                { name: "iOS 10.3.3 beta 5", date: "June 28, 2017", alignment: "left" },
                                { name: "iOS 10.3.3 beta 6", date: "July 5, 2017", alignment: "right" },
                                { name: "iOS 10.3.3 final build", date: "July 19, 2017", spanTwo: true }
                            ],
                        },
                    };
            initializeTimelinePage(timelines);
        },
        "ios-11.html": () => {
            const timelines = {
                        "11-0": {
                            label: "iOS 11.0",
                            releases: [
                                { name: "iOS 11.0 beta 1", date: "June 5, 2017", alignment: "left" },
                                { name: "iOS 11.0 beta 2", date: "June 21, 2017", note: "build 2: June 26, 2017", alignment: "right" },
                                { name: "iOS 11.0 beta 3", date: "July 10, 2017", alignment: "left" },
                                { name: "iOS 11.0 beta 4", date: "July 24, 2017", alignment: "right" },
                                { name: "iOS 11.0 beta 5", date: "August 7, 2017", alignment: "left" },
                                { name: "iOS 11.0 beta 6", date: "August 14, 2017", alignment: "right" },
                                { name: "iOS 11.0 beta 7", date: "August 21, 2017", alignment: "left" },
                                { name: "iOS 11.0 beta 8", date: "August 28, 2017", alignment: "right" },
                                { name: "iOS 11.0 beta 9", date: "August 31, 2017", alignment: "left" },
                                { name: "iOS 11.0 beta 10", date: "September 6, 2017", alignment: "right" },
                                {
                                    pair: [
                                        { name: "iOS 11.0 GM build", date: "September 12, 2017" },
                                        { name: "iOS 11.0 final build", date: "September 19, 2017" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                {
                                    trio: [
                                        { name: "iOS 11.0.1", date: "September 26, 2017" },
                                        { name: "iOS 11.0.2", date: "October 3, 2017" },
                                        { name: "iOS 11.0.3", date: "October 11, 2017" }
                                    ],
                                    className: "release-trio-tight"
                                }
                            ]
                        },
                        "11-1": {
                            label: "iOS 11.1",
                            releases: [
                                { name: "iOS 11.1 beta 1", date: "September 27, 2017", alignment: "left" },
                                { name: "iOS 11.1 beta 2", date: "October 9, 2017", alignment: "right" },
                                { name: "iOS 11.1 beta 3", date: "October 16, 2017", alignment: "left" },
                                { name: "iOS 11.1 beta 4", date: "October 20, 2017", alignment: "right" },
                                { name: "iOS 11.1 beta 5", date: "October 23, 2017", spanTwo: true },
                                { name: "iOS 11.1 final build", date: "October 31, 2017", spanTwo: true }
                            ],
                            supplemental: [
                                {
                                    pair: [
                                        { name: "iOS 11.1.1", date: "November 9, 2017" },
                                        { name: "iOS 11.1.2", date: "November 16, 2017" },
                                    ],
                                    className: "release-pair-tight"
                                }
                            ]
                        },
                        "11-2": {
                            label: "iOS 11.2",
                            columnGap: "175px",
                            releases: [
                                { name: "iOS 11.2 beta 1", date: "October 30, 2017", alignment: "left" },
                                { name: "iOS 11.2 beta 2", date: "November 6, 2017", alignment: "right" },
                                { name: "iOS 11.2 beta 3", date: "November 13, 2017", alignment: "left" },
                                { name: "iOS 11.2 beta 4", date: "November 17, 2017", alignment: "right" },
                                { name: "iOS 11.2 beta 5", date: "November 28, 2017", alignment: "left" },
                                { name: "iOS 11.2 beta 6", date: "December 1, 2017", alignment: "right" },
                                { name: "iOS 11.2 final build", date: "December 2, 2017", spanTwo: true }
                            ],
                            supplemental: [
                                {
                                    pair: [
                                        { name: "iOS 11.2.1", date: "December 13, 2017" },
                                        { name: "iOS 11.2.2", date: "January 8, 2018" },
                                    ],
                                    className: "release-pair-tight"
                                }
                            ]
                        },
                        "11-2-5": {
                            label: "iOS 11.2.5",
                            columnGap: "175px",
                            releases: [
                                { name: "iOS 11.2.5 beta 1", date: "December 13, 2017", alignment: "left" },
                                { name: "iOS 11.2.5 beta 2", date: "December 19, 2017", alignment: "right" },
                                { name: "iOS 11.2.5 beta 3", date: "January 3, 2018", alignment: "left" },
                                { name: "iOS 11.2.5 beta 4", date: "January 9, 2018", alignment: "right" },
                                { name: "iOS 11.2.5 beta 5", date: "January 11, 2018", alignment: "left" },
                                { name: "iOS 11.2.5 beta 6", date: "January 17, 2018", alignment: "right" },
                                { name: "iOS 11.2.5 beta 7", date: "January 19, 2018", spanTwo: true },
                                { name: "iOS 11.2.5 final build", date: "January 23, 2018", spanTwo: true }
                            ],
                            supplemental: [
                                { name: "iOS 11.2.6", date: "February 19, 2018" }
                                ]
                        },
                        "11-3": {
                            label: "iOS 11.3",
                            columnGap: "220px",
                            releases: [
                                { name: "iOS 11.3 beta 1", date: "January 24, 2018", alignment: "left" },
                                { name: "iOS 11.3 beta 2", date: "February 6, 2018", alignment: "right" },
                                { name: "iOS 11.3 beta 3", date: "February 20, 2018", alignment: "left" },
                                { name: "iOS 11.3 beta 4", date: "March 5, 2018", alignment: "right" },
                                { name: "iOS 11.3 beta 5", date: "March 12, 2018", alignment: "left" },
                                { name: "iOS 11.3 beta 6", date: "March 16, 2018", alignment: "right" },
                                { name: "iOS 11.3 final build", date: "March 29, 2018", spanTwo: true }
                            ],
                            supplemental: [
                                { name: "iOS 11.3.1", date: "April 24, 2018" }
                                ]
                        },
                        "11-4": {
                            label: "iOS 11.4",
                            columnGap: "315px",
                            releases: [
                                { name: "iOS 11.4 beta 1", date: "April 2, 2018", alignment: "left" },
                                { name: "iOS 11.4 beta 2", date: "April 16, 2018", alignment: "right" },
                                { name: "iOS 11.4 beta 3", date: "May 1, 2018", alignment: "left" },
                                { name: "iOS 11.4 beta 4", date: "May 7, 2018", alignment: "right" },
                                { name: "iOS 11.4 beta 5", date: "May 14, 2018", alignment: "left" },
                                { name: "iOS 11.4 beta 6", date: "May 17, 2018", alignment: "right" },
                                { name: "iOS 11.4 final build", date: "May 29, 2018", spanTwo: true }
                            ]
                        },
                        "11-4-1": {
                            label: "iOS 11.4.1",
                            releases: [
                                { name: "iOS 11.4.1 beta 1", date: "May 30, 2018", alignment: "left" },
                                { name: "iOS 11.4.1 beta 2", date: "June 11, 2018", alignment: "right" },
                                { name: "iOS 11.4.1 beta 3", date: "June 18, 2018", alignment: "left" },
                                { name: "iOS 11.4.1 beta 4", date: "June 25, 2018", alignment: "right" },
                                { name: "iOS 11.4.1 beta 5", date: "July 2, 2018", spanTwo: true },
                                { name: "iOS 11.4.1 final build", date: "July 9, 2018", spanTwo: true }
                            ]
                        }
                    };
            initializeTimelinePage(timelines);
        },
        "ios-12.html": () => {
            const timelines = {
                        "12-0": {
                            label: "iOS 12.0",
                            releases: [
                                { name: "iOS 12.0 beta 1", date: "June 4, 2018", alignment: "left" },
                                { name: "iOS 12.0 beta 2", date: "June 19, 2018", alignment: "right" },
                                { name: "iOS 12.0 beta 3", date: "July 3, 2018", alignment: "left" },
                                { name: "iOS 12.0 beta 4", date: "July 17, 2018", alignment: "right" },
                                { name: "iOS 12.0 beta 5", date: "July 30, 2018", alignment: "left" },
                                { name: "iOS 12.0 beta 6", date: "August 6, 2018", alignment: "right" },
                                { name: "iOS 12.0 beta 7", date: "August 13, 2018", alignment: "left" },
                                { name: "iOS 12.0 beta 8", date: "August 15, 2018", alignment: "right" },
                                { name: "iOS 12.0 beta 9", date: "August 20, 2018", alignment: "left" },
                                { name: "iOS 12.0 beta 10", date: "August 23, 2018", alignment: "right" },
                                { name: "iOS 12.0 beta 11", date: "August 27, 2018", alignment: "left" },
                                { name: "iOS 12.0 beta 12", date: "August 31, 2018", alignment: "right" },
                                {
                                    pair: [
                                        { name: "iOS 12.0 GM build", date: "September 12, 2018" },
                                        { name: "iOS 12.0 final build", date: "September 17, 2018" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "iOS 12.0.1", date: "October 8, 2018" }
                            ]
                        },
                        "12-1": {
                            label: "iOS 12.1",
                            releases: [
                                { name: "iOS 12.1 beta 1", date: "September 18, 2018", alignment: "left" },
                                { name: "iOS 12.1 beta 2", date: "October 2, 2018", alignment: "right" },
                                { name: "iOS 12.1 beta 3", date: "October 9, 2018", alignment: "left" },
                                { name: "iOS 12.1 beta 4", date: "October 16, 2018", alignment: "right" },
                                { name: "iOS 12.1 beta 5", date: "October 23, 2018", spanTwo: true },
                                { name: "iOS 12.1 final build", date: "October 30, 2018", spanTwo: true}
                            ]
                        },
                        "12-1-1": {
                            label: "iOS 12.1.1 + 12.1.2",
                            releases: [
                                { name: "iOS 12.1.1 beta 1", date: "October 31, 2018", alignment: "left" },
                                { name: "iOS 12.1.1 beta 2", date: "November 7, 2018", alignment: "right" },
                                { name: "iOS 12.1.1 beta 3", date: "November 15, 2018", spanTwo: true },
                                { name: "iOS 12.1.1 final build", date: "December 5, 2018", spanTwo: true }
                            ],
                            supplemental: [
                                { date: "iOS 12.1.2", note: "beta 1: Dec 10, 2018\nfinal build: Dec 17, 2018"}
                            ]
                        },
                        "12-1-2": {
                            label: "iOS 12.1.2 + 12.1.3",
                            intro: "iOS 12.1.3 beta 2 is a continuation of iOS 12.1.2.",
                            releases: [
                                { name: "iOS 12.1.2 beta 1", date: "December 10, 2018", alignment: "left" },
                                { name: "iOS 12.1.2 final build", date: "December 17, 2018", alignment: "right" },
                                { name: "iOS 12.1.3 beta 2", date: "December 19, 2018", alignment: "left" },
                                { name: "iOS 12.1.3 beta 3", date: "January 7, 2019", alignment: "right" },
                                { name: "iOS 12.1.3 beta 4", date: "January 10, 2019", spanTwo: true },
                                { name: "iOS 12.1.3 final build", date: "January 22, 2019", spanTwo: true }
                            ],
                            supplemental: [
                                { name: "iOS 12.1.4", date: "February 7, 2019" }
                            ]
                        },
                        "12-2": {
                            label: "iOS 12.2",
                            releases: [
                                { name: "iOS 12.2 beta 1", date: "January 24, 2019", alignment: "left" },
                                { name: "iOS 12.2 beta 2", date: "February 4, 2019", alignment: "right" },
                                { name: "iOS 12.2 beta 3", date: "February 19, 2019", alignment: "left" },
                                { name: "iOS 12.2 beta 4", date: "March 4, 2019", alignment: "right" },
                                { name: "iOS 12.2 beta 5", date: "March 11, 2019", alignment: "left" },
                                { name: "iOS 12.2 beta 6", date: "March 18, 2019", alignment: "right" },
                                { name: "iOS 12.2 final build", date: "March 25, 2019", spanTwo: true }
                            ]
                        },
                        "12-3": {
                            label: "iOS 12.3",
                            releases: [
                                { name: "iOS 12.3 beta 1", date: "March 27, 2019", alignment: "left" },
                                { name: "iOS 12.3 beta 2", date: "April 8, 2019", alignment: "right" },
                                { name: "iOS 12.3 beta 3", date: "April 22, 2019", alignment: "left" },
                                { name: "iOS 12.3 beta 4", date: "April 29, 2019", alignment: "right" },
                                { name: "iOS 12.3 beta 5", date: "May 7, 2019", alignment: "left" },
                                { name: "iOS 12.3 beta 6", date: "May 10, 2019", alignment: "right" },
                                { name: "iOS 12.3 final build", date: "May 13, 2019", spanTwo: true }
                            ],
                            supplemental: [
                                {
                                    pair: [
                                        { name: "iOS 12.3.1", date: "May 24, 2019" },
                                        { name: "iOS 12.3.2", date: "June 10, 2019" },
                                    ],
                                    className: "release-pair-tight"
                                }
                            ]
                        },
                        "12-4": {
                            label: "iOS 12.4",
                            releases: [
                                { name: "iOS 12.4 beta 1", date: "May 15, 2019", alignment: "left" },
                                { name: "iOS 12.4 beta 2", date: "May 20, 2019", alignment: "right" },
                                { name: "iOS 12.4 beta 3", date: "May 28, 2019", alignment: "left" },
                                { name: "iOS 12.4 beta 4", date: "June 11, 2019", alignment: "right" },
                                { name: "iOS 12.4 beta 5", date: "June 24, 2019", alignment: "left" },
                                { name: "iOS 12.4 beta 6", date: "July 9, 2019", alignment: "right" },
                                { name: "iOS 12.4 beta 7", date: "July 16, 2019", spanTwo: true },
                                { name: "iOS 12.4 final build", date: "July 22, 2019", spanTwo: true }
                            ],
                            supplemental: [
                                {
                                    trio: [
                                        { name: "iOS 12.4.1", date: "August 26, 2019" },
                                        { name: "iOS 12.4.2", date: "September 26, 2019" },
                                        { name: "iOS 12.4.3", date: "October 28, 2019" }
                                    ]
                                },
                                {
                                    trio: [
                                        { name: "iOS 12.4.4", date: "December 10, 2019" },
                                        { name: "iOS 12.4.5", date: "January 28, 2020" },
                                        { name: "iOS 12.4.6", date: "March 24, 2020" }
                                    ]
                                },
                                {
                                    trio: [
                                        { name: "iOS 12.4.7", date: "May 20, 2020" },
                                        { name: "iOS 12.4.8", date: "July 15, 2020" },
                                        { name: "iOS 12.4.9", date: "November 5, 2020"}
                                    ]
                                }
                            ]
                        },
                        "12-5-x": {
                            label: "iOS 12.5.x",
                            releases: [
                                {
                                    trio: [
                                        { date: "iOS 12.5", note: "Final build: Dec 14, 2020" },
                                        { date: "iOS 12.5.1", note: "Final build: Jan 11, 2021" },
                                        { date: "iOS 12.5.2", note: "Final build: Mar 26, 2021" }
                                    ]
                                },
                                {
                                    trio: [
                                        { date: "iOS 12.5.3", note: "Final build: May 3, 2021" },
                                        { date: "iOS 12.5.4", note: "Final build: Jun 14, 2021" },
                                        { date: "iOS 12.5.5", note: "Final build: Sep 23, 2021" }
                                    ]
                                },
                                {
                                    trio: [
                                        { date: "iOS 12.5.6", note: "Final build: Aug 31, 2022" },
                                        { date: "iOS 12.5.7", note: "Final build: Jan 23, 2023" },
                                        { date: "iOS 12.5.8", note: "Final build: Jan 26, 2026"}
                                    ]
                                }
                            ]
                        }
                    };
            initializeTimelinePage(timelines);
        },
        "ios-13.html": () => {
            const timelines = {
                        "13-0": {
                            label: "iOS 13.0",
                            releases: [
                                { name: "iOS 13.0 beta 1", date: "June 3, 2019", alignment: "left" },
                                { name: "iOS 13.0 beta 2", date: "June 17, 2019", alignment: "right" },
                                { name: "iOS 13.0 beta 3", date: "July 2, 2019", note: "build 2: July 8, 2019", alignment: "left" },
                                { name: "iOS 13.0 beta 4", date: "July 17, 2019", alignment: "right" },
                                { name: "iOS 13.0 beta 5", date: "July 29, 2019", alignment: "left" },
                                { name: "iOS 13.0 beta 6", date: "August 7, 2019", alignment: "right" },
                                { name: "iOS 13.0 beta 7", date: "August 15, 2019", alignment: "left" },
                                { name: "iOS 13.0 beta 8", date: "August 21, 2019", alignment: "right" },
                                {
                                    pair: [
                                        { name: "iOS 13.0 GM build", date: "September 10, 2019" },
                                        { name: "iOS 13.0 final build", date: "September 19, 2019" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "13-1": {
                            label: "iOS 13.1",
                            releases: [
                                { name: "iOS 13.1 beta 1", date: "August 27, 2019", alignment: "left" },
                                { name: "iOS 13.1 beta 2", date: "September 4, 2019", alignment: "right" },
                                { name: "iOS 13.1 beta 3", date: "September 10, 2019", alignment: "left" },
                                { name: "iOS 13.1 beta 4", date: "September 17, 2019", alignment: "right" },
                                { name: "iOS 13.1 final build", date: "September 24, 2019", spanTwo: true }
                            ],
                            supplemental: [
                                {
                                    trio: [
                                        { name: "iOS 13.1.1", date: "September 27, 2019" },
                                        { name: "iOS 13.1.2", date: "September 30, 2019" },
                                        { name: "iOS 13.1.3", date: "October 15, 2019" }
                                    ]
                                }
                            ]
                        },
                        "13-2": {
                            label: "iOS 13.2",
                            releases: [
                                { name: "iOS 13.2 beta 1", date: "October 2, 2019", alignment: "left" },
                                { name: "iOS 13.2 beta 2", date: "October 10, 2019", alignment: "right" },
                                { name: "iOS 13.2 beta 3", date: "October 16, 2019", alignment: "left" },
                                { name: "iOS 13.2 beta 4", date: "October 23, 2019", alignment: "right" },
                                { name: "iOS 13.2 final build", date: "October 28, 2019", spanTwo: true }
                            ],
                            supplemental: [
                                { pair: [
                                        { name: "iOS 13.2.2", date: "November 7, 2019" },
                                        { name: "iOS 13.2.3", date: "November 18, 2019" },
                                    ],
                                    className: "release-pair-tight"
                                }
                            ]
                        },
                        "13-3": {
                            label: "iOS 13.3",
                            releases: [
                                { name: "iOS 13.3 beta 1", date: "November 5, 2019", alignment: "left" },
                                { name: "iOS 13.3 beta 2", date: "November 12, 2019", alignment: "right" },
                                { name: "iOS 13.3 beta 3", date: "November 20, 2019", alignment: "left" },
                                { name: "iOS 13.3 beta 4", date: "December 5, 2019", alignment: "right" },
                                { name: "iOS 13.3 final build", date: "December 10, 2019", spanTwo: true }
                            ],
                        },
                        "13-3-1": {
                            label: "iOS 13.3.1",
                            releases: [
                                { name: "iOS 13.3.1 beta 1", date: "December 17, 2019", alignment: "left" },
                                { name: "iOS 13.3.1 beta 2", date: "January 14, 2020", alignment: "right" },
                                { name: "iOS 13.3.1 beta 3", date: "January 22, 2020", spanTwo: true },
                                { name: "iOS 13.3.1 final build", date: "January 28, 2020", spanTwo: true }
                            ],
                        },
                        "13-4": {
                            label: "iOS 13.4",
                            releases: [
                                { name: "iOS 13.4 beta 1", date: "February 5, 2020", alignment: "left" },
                                { name: "iOS 13.4 beta 2", date: "February 19, 2020", alignment: "right" },
                                { name: "iOS 13.4 beta 3", date: "February 26, 2020", alignment: "left" },
                                { name: "iOS 13.4 beta 4", date: "March 3, 2020", alignment: "right" },
                                { name: "iOS 13.4 beta 5", date: "March 10, 2020", alignment: "left" },
                                { name: "iOS 13.4 beta 6", date: "March 18, 2020", alignment: "right" },
                                { name: "iOS 13.4 final build", date: "March 24, 2020", spanTwo: true }
                            ],
                            supplemental: [
                                { name: "iOS 13.4.1", date: "April 7, 2020" }
                            ]
                        },
                        "13-5": {
                            label: "iOS 13.4.5 + 13.5",
                            releases: [
                                { name: "iOS 13.4.5 beta 1", date: "March 31, 2020", alignment: "left" },
                                { name: "iOS 13.4.5 beta 2", date: "April 15, 2020", alignment: "right" },
                                { name: "iOS 13.5 beta 3", date: "April 29, 2020", alignment: "left" },
                                { name: "iOS 13.5 beta 4", date: "May 6, 2020", alignment: "right" },
                                {
                                    pair: [
                                        { name: "iOS 13.5 GM build", date: "May 18, 2020" },
                                        { name: "iOS 13.5 final build", date: "May 20, 2020" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "iOS 13.5.1", date: "June 1, 2020" }
                            ]
                        },
                        "13-6": {
                            label: "iOS 13.5.5 + 13.6",
                            releases: [
                                { name: "iOS 13.5.5 beta 1", date: "June 1, 2020", spanTwo: true },
                                { name: "iOS 13.6 beta 2", date: "June 9, 2020", alignment: "left" },
                                { name: "iOS 13.6 beta 3", date: "June 30, 2020", alignment: "right" },
                                {
                                    pair: [
                                        { name: "iOS 13.6 GM build", date: "July 9, 2020" },
                                        { name: "iOS 13.6 final build", date: "July 15, 2020" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "iOS 13.6.1", date: "August 12, 2020" }
                            ]
                        },
                        "13-7": {
                            label: "iOS 13.7",
                            releases: [
                                {
                                    pair: [
                                        { name: "iOS 13.7 beta 1", date: "August 26, 2020" },
                                        { name: "iOS 13.7 final build", date: "September 1, 2020" }
                                    ],
                                    className: "release-pair-builds"
                                },
                            ]
                        },
                    };
            initializeTimelinePage(timelines);
        },
        "ios-14.html": () => {
            const timelines = {
                        "14-0": {
                            label: "iOS 14.0",
                            releases: [
                                { name: "iOS 14.0 beta 1", date: "June 22, 2020", alignment: "left" },
                                { name: "iOS 14.0 beta 2", date: "July 7, 2020", alignment: "right" },
                                { name: "iOS 14.0 beta 3", date: "July 22, 2020", alignment: "left" },
                                { name: "iOS 14.0 beta 4", date: "August 4, 2020", alignment: "right" },
                                { name: "iOS 14.0 beta 5", date: "August 18, 2020", alignment: "left" },
                                { name: "iOS 14.0 beta 6", date: "August 25, 2020", alignment: "right" },
                                { name: "iOS 14.0 beta 7", date: "September 3, 2020", alignment: "left" },
                                { name: "iOS 14.0 beta 8", date: "September 9, 2020", alignment: "right" },
                                {
                                    pair: [
                                        { name: "iOS 14.0 GM build", date: "September 15, 2020" },
                                        { name: "iOS 14.0 final build", date: "September 16, 2020" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "iOS 14.0.1", date: "September 24, 2020" }
                            ]
                        },
                        "14-1": {
                            label: "iOS 14.1",
                            releases: [
                                { pair: [
                                        { name: "iOS 14.1 GM build", date: "October 13, 2020" },
                                        { name: "iOS 14.1 final build", date: "October 20, 2020" }
                                    ],
                                    className: "release-pair-tight"
                                }
                            ],
                        },
                        "14-2": {
                            label: "iOS 14.2",
                            releases: [
                                { name: "iOS 14.2 beta 1", date: "September 17, 2020", alignment: "left" },
                                { name: "iOS 14.2 beta 2", date: "September 29, 2020", alignment: "right" },
                                { name: "iOS 14.2 beta 3", date: "October 13, 2020", alignment: "left" },
                                { name: "iOS 14.2 beta 4", date: "October 20, 2020", alignment: "right" },
                                {
                                    pair: [
                                        { name: "iOS 14.2 RC build", date: "October 30, 2020" },
                                        { name: "iOS 14.2 final build", date: "November 5, 2020" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "iOS 14.2.1", date: "November 18, 2020" }
                            ]
                        },
                        "14-3": {
                            label: "iOS 14.3",
                            releases: [
                                { name: "iOS 14.3 beta 1", date: "November 12, 2020", alignment: "left" },
                                { name: "iOS 14.3 beta 2", date: "November 17, 2020", alignment: "right" },
                                { name: "iOS 14.3 beta 3", date: "December 2, 2020", spanTwo: true },
                                {
                                    pair: [
                                        { name: "iOS 14.3 RC build", date: "December 8, 2020", note: "build 2: December 10, 2020" },
                                        { name: "iOS 14.3 final build", date: "December 14, 2020" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "14-4": {
                            label: "iOS 14.4",
                            releases: [
                                { name: "iOS 14.4 beta 1", date: "December 16, 2020", alignment: "left" },
                                { name: "iOS 14.4 beta 2", date: "January 13, 2021", alignment: "right" },
                                {
                                    pair: [
                                        { name: "iOS 14.4 RC build", date: "January 21, 2021" },
                                        { name: "iOS 14.4 final build", date: "January 26, 2021" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { pair: [
                                        { name: "iOS 14.4.1", date: "March 8, 2021" },
                                        { name: "iOS 14.4.2", date: "March 26, 2021" }
                                    ],
                                    className: "release-pair-tight" }
                            ]
                        },
                        "14-5": {
                            label: "iOS 14.5",
                            releases: [
                                { name: "iOS 14.5 beta 1", date: "February 1, 2021", note: "build 2: February 4, 2021", alignment: "left" },
                                { name: "iOS 14.5 beta 2", date: "February 16, 2021", alignment: "right" },
                                { name: "iOS 14.5 beta 3", date: "March 2, 2021", alignment: "left" },
                                { name: "iOS 14.5 beta 4", date: "March 15, 2021", alignment: "right" },
                                { name: "iOS 14.5 beta 5", date: "March 23, 2021", alignment: "left" },
                                { name: "iOS 14.5 beta 6", date: "March 31, 2021", alignment: "right" },
                                { name: "iOS 14.5 beta 7", date: "April 7, 2021", alignment: "left" },
                                { name: "iOS 14.5 beta 8", date: "April 13, 2021", alignment: "right" },
                                {
                                    pair: [
                                        { name: "iOS 14.5 RC build", date: "April 20, 2021" },
                                        { name: "iOS 14.5 final build", date: "April 26, 2021" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "iOS 14.5.1", date: "May 3, 2021" }
                            ]
                        },
                        "14-6": {
                            label: "iOS 14.6",
                            releases: [
                                { name: "iOS 14.6 beta 1", date: "April 22, 2021", alignment: "left" },
                                { name: "iOS 14.6 beta 2", date: "April 30, 2021", alignment: "right" },
                                { name: "iOS 14.6 beta 3", date: "May 10, 2021", spanTwo: true },
                                {
                                    pair: [
                                        { name: "iOS 14.6 RC build", date: "May 17, 2021", note: "build 2: May 21, 2021" },
                                        { name: "iOS 14.6 final build", date: "May 24, 2021" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "14-7": {
                            label: "iOS 14.7",
                            releases: [
                                { name: "iOS 14.7 beta 1", date: "May 19, 2021", alignment: "left" },
                                { name: "iOS 14.7 beta 2", date: "June 2, 2021", alignment: "right" },
                                { name: "iOS 14.7 beta 3", date: "June 14, 2021", alignment: "left" },
                                { name: "iOS 14.7 beta 4", date: "June 29, 2021", alignment: "right" },
                                { name: "iOS 14.7 beta 5", date: "July 8, 2021", spanTwo: true },
                                {
                                    pair: [
                                        { name: "iOS 14.7 RC build", date: "July 13, 2021" },
                                        { name: "iOS 14.7 final build", date: "July 19, 2021" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "iOS 14.7.1", date: "July 26, 2021" }
                            ]
                        },
                        "14-8-x": {
                            label: "iOS 14.8.x",
                            releases: [
                                {
                                    pair: [
                                        { name: "iOS 14.8", date: "September 13, 2021" },
                                        { name: "iOS 14.8.1", date: "October 26, 2021" }
                                    ],
                                    className: "release-pair-builds"
                                },
                            ]
                        },
                    };
            initializeTimelinePage(timelines);
        },
        "ios-15.html": () => {
            const timelines = {
                        "15-0": {
                            label: "iOS 15.0",
                            releases: [
                                { name: "iOS 15.0 beta 1", date: "June 7, 2021", alignment: "left" },
                                { name: "iOS 15.0 beta 2", date: "June 24, 2021", note: "build 2: June 30, 2021", alignment: "right" },
                                { name: "iOS 15.0 beta 3", date: "July 14, 2021", alignment: "left" },
                                { name: "iOS 15.0 beta 4", date: "July 27, 2021", alignment: "right" },
                                { name: "iOS 15.0 beta 5", date: "August 10, 2021", alignment: "left" },
                                { name: "iOS 15.0 beta 6", date: "August 17, 2021", alignment: "right" },
                                { name: "iOS 15.0 beta 7", date: "August 25, 2021", alignment: "left" },
                                { name: "iOS 15.0 beta 8", date: "August 31, 2021", alignment: "right" },
                                {
                                    pair: [
                                        { name: "iOS 15.0 RC build", date: "September 14, 2021" },
                                        { name: "iOS 15.0 final build", date: "September 20, 2021" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                {
                                    pair: [
                                        { name: "iOS 15.0.1", date: "October 1, 2021" },
                                        { name: "iOS 15.0.2", date: "October 11, 2021" }
                                    ],
                                    className: "release-pair-tight"
                                }
                            ]
                        },
                        "15-1": {
                            label: "iOS 15.1",
                            releases: [
                                { name: "iOS 15.1 beta 1", date: "September 21, 2021", alignment: "left" },
                                { name: "iOS 15.1 beta 2", date: "September 28, 2021", alignment: "right" },
                                { name: "iOS 15.1 beta 3", date: "October 6, 2021", alignment: "left" },
                                { name: "iOS 15.1 beta 4", date: "October 13, 2021", alignment: "right" },
                                {
                                    pair: [
                                        { name: "iOS 15.1 RC build", date: "October 18, 2021" },
                                        { name: "iOS 15.1 final build", date: "October 25, 2021" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "iOS 15.1.1", date: "November 17, 2021" }
                            ]
                        },
                        "15-2": {
                            label: "iOS 15.2",
                            releases: [
                                { name: "iOS 15.2 beta 1", date: "October 27, 2021", alignment: "left" },
                                { name: "iOS 15.2 beta 2", date: "November 9, 2021", alignment: "right" },
                                { name: "iOS 15.2 beta 3", date: "November 16, 2021", alignment: "left" },
                                { name: "iOS 15.2 beta 4", date: "December 2, 2021", alignment: "right" },
                                {
                                    pair: [
                                        { name: "iOS 15.2 RC build", date: "December 7, 2021", note: "build 2: December 10, 2021" },
                                        { name: "iOS 15.2 final build", date: "December 13, 2021" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "iOS 15.2.1", date: "January 12, 2022" }
                            ]
                        },
                        "15-3": {
                            label: "iOS 15.3",
                            releases: [
                                { name: "iOS 15.3 beta 1", date: "December 17, 2021", alignment: "left" },
                                { name: "iOS 15.3 beta 2", date: "January 12, 2022", alignment: "right" },
                                {
                                    pair: [
                                        { name: "iOS 15.3 RC build", date: "January 20, 2022" },
                                        { name: "iOS 15.3 final build", date: "January 26, 2022" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "iOS 15.3.1", date: "February 10, 2022" }
                            ]
                        },
                        "15-4": {
                            label: "iOS 15.4",
                            releases: [
                                { name: "iOS 15.4 beta 1", date: "January 27, 2022", alignment: "left" },
                                { name: "iOS 15.4 beta 2", date: "February 8, 2022", alignment: "right" },
                                { name: "iOS 15.4 beta 3", date: "February 15, 2022", alignment: "left" },
                                { name: "iOS 15.4 beta 4", date: "February 22, 2022", alignment: "right" },
                                { name: "iOS 15.4 beta 5", date: "March 1, 2022", spanTwo: true },
                                {
                                    pair: [
                                        { name: "iOS 15.4 RC build", date: "March 8, 2022" },
                                        { name: "iOS 15.4 final build", date: "March 14, 2022" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "iOS 15.4.1", date: "March 31, 2022" }
                            ]
                        },
                        "15-5": {
                            label: "iOS 15.5",
                            releases: [
                                { name: "iOS 15.5 beta 1", date: "April 5, 2022", alignment: "left" },
                                { name: "iOS 15.5 beta 2", date: "April 19, 2022", alignment: "right" },
                                { name: "iOS 15.5 beta 3", date: "April 26, 2022", alignment: "left" },
                                { name: "iOS 15.5 beta 4", date: "May 3, 2022", alignment: "right" },
                                {
                                    pair: [
                                        { name: "iOS 15.5 RC build", date: "May 12, 2022" },
                                        { name: "iOS 15.5 final build", date: "May 16, 2022" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "15-6": {
                            label: "iOS 15.6",
                            releases: [
                                { name: "iOS 15.6 beta 1", date: "May 18, 2022", alignment: "left" },
                                { name: "iOS 15.6 beta 2", date: "May 31, 2022", alignment: "right" },
                                { name: "iOS 15.6 beta 3", date: "June 14, 2022", alignment: "left" },
                                { name: "iOS 15.6 beta 4", date: "June 28, 2022", alignment: "right" },
                                { name: "iOS 15.6 beta 5", date: "July 5, 2022", spanTwo: true },
                                {
                                    pair: [
                                        { name: "iOS 15.6 RC build", date: "July 12, 2022", note: "build 2: July 15, 2022" },
                                        { name: "iOS 15.6 final build", date: "July 20, 2022" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "iOS 15.6.1", date: "August 17, 2022" }
                            ]
                        },
                        "15-7-x": {
                            label: "iOS 15.7.x",
                            releases: [
                                {
                                    trio: [
                                        { date: "iOS 15.7", note: "RC build: Sep 7, 2022\nFinal build: Sep 12, 2022" },
                                        { date: "iOS 15.7.1", note: "RC build: Oct 18, 2022\nFinal build: Oct 27, 2022" },
                                        { date: "iOS 15.7.2", note: "RC build: Dec 7, 2022\nFinal build: Dec 13, 2022"}
                                    ],
                                    className: "release-pair-compact"
                                },
                                {
                                    trio: [
                                        { date: "iOS 15.7.3", note: "RC build: Jan 18, 2023\nFinal build: Jan 23, 2023" },
                                        { date: "iOS 15.7.4", note: "RC build: Mar 21, 2023\nFinal build: Mar 27, 2023" },
                                        { date: "iOS 15.7.5", note: "Final build: Apr 10, 2023"}
                                    ],
                                    className: "release-pair-compact"
                                },
                                {
                                    trio: [
                                        { date: "iOS 15.7.6", note: "RC build: May 9, 2023\nFinal build: May 18, 2023" },
                                        { date: "iOS 15.7.7", note: "Final build: Jun 21, 2023" },
                                        { date: "iOS 15.7.8", note: "RC build: Jul 18, 2023\nFinal build: July 24, 2023"}
                                    ],
                                    className: "release-pair-compact"
                                },
                            ]
                        },
                        "15-8-x": {
                            label: "iOS 15.8.x",
                            releases: [
                                {
                                    trio: [
                                        { date: "iOS 15.8", note: "RC build: Oct 17, 2023\nFinal build: Oct 25, 2023" },
                                        { date: "iOS 15.8.1", note: "RC build: Jan 17, 2024\nFinal build: Jan 22, 2024" },
                                        { date: "iOS 15.8.2", note: "RC build: Feb 27, 2024\nFinal build: Mar 5, 2024"}
                                    ],
                                    className: "release-pair-compact"
                                },
                                {
                                    trio: [
                                        { date: "iOS 15.8.3", note: "RC build: Jul 23, 2024\nFinal build: Jul 29, 2024" },
                                        { date: "iOS 15.8.4", note: "Final build: Mar 31, 2025" },
                                        { date: "iOS 15.8.5", note: "RC build: Sep 9, 2025\nFinal build: Sep 15, 2025"}
                                    ],
                                    className: "release-pair-compact"
                                },
                                {
                                    trio: [
                                        { date: "iOS 15.8.6", note: "Final build: Jan 26, 2026" },
                                        { date: "iOS 15.8.7", note: "Final build: Mar 11, 2026" },
                                        { date: "iOS 15.8.8", note: "Final build: May 11, 2026"}
                                    ],
                                    className: "release-pair-compact"
                                },
                            ]
                        },
                    };
            initializeTimelinePage(timelines);
        },
        "ios-16.html": () => {
            const timelines = {
                        "16-0": {
                            label: "iOS 16.0",
                            releases: [
                                { name: "iOS 16.0 beta 1", date: "June 6, 2022", alignment: "left" },
                                { name: "iOS 16.0 beta 2", date: "June 22, 2022", alignment: "right" },
                                { name: "iOS 16.0 beta 3", date: "July 6, 2022", note: "build 2: July 11, 2022", alignment: "left" },
                                { name: "iOS 16.0 beta 4", date: "July 27, 2022", alignment: "right" },
                                { name: "iOS 16.0 beta 5", date: "August 8, 2022", alignment: "left" },
                                { name: "iOS 16.0 beta 6", date: "August 15, 2022", alignment: "right" },
                                { name: "iOS 16.0 beta 7", date: "August 23, 2022", alignment: "left" },
                                { name: "iOS 16.0 beta 8", date: "August 29, 2022", alignment: "right" },
                                {
                                    pair: [
                                        { name: "iOS 16.0 RC build", date: "September 7, 2022" },
                                        { name: "iOS 16.0 final build", date: "September 12, 2022" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                {
                                    pair: [
                                        { name: "iOS 16.0.2", date: "September 22, 2022" },
                                        { name: "iOS 16.0.3", date: "October 10, 2022" }
                                    ],
                                    className: "release-pair-tight"
                                }
                            ]
                        },
                        "16-1": {
                            label: "iOS 16.1",
                            releases: [
                                { name: "iOS 16.1 beta 1", date: "September 14, 2022", alignment: "left" },
                                { name: "iOS 16.1 beta 2", date: "September 20, 2022", alignment: "right" },
                                { name: "iOS 16.1 beta 3", date: "September 27, 2022", alignment: "left" },
                                { name: "iOS 16.1 beta 4", date: "October 4, 2022", alignment: "right" },
                                { name: "iOS 16.1 beta 5", date: "October 11, 2022", spanTwo: true },
                                {
                                    pair: [
                                        { name: "iOS 16.1 RC build", date: "October 18, 2022" },
                                        { name: "iOS 16.1 final build", date: "October 24, 2022" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                {
                                    pair: [
                                        { name: "iOS 16.1.1", date: "November 9, 2022" },
                                        { name: "iOS 16.1.2", date: "November 30, 2022" }
                                    ],
                                    className: "release-pair-tight"
                                }
                            ]
                        },
                        "16-2": {
                            label: "iOS 16.2",
                            releases: [
                                { name: "iOS 16.2 beta 1", date: "October 25, 2022", alignment: "left" },
                                { name: "iOS 16.2 beta 2", date: "November 8, 2022", alignment: "right" },
                                { name: "iOS 16.2 beta 3", date: "November 15, 2022", alignment: "left" },
                                { name: "iOS 16.2 beta 4", date: "December 1, 2022", alignment: "right" },
                                {
                                    pair: [
                                        { name: "iOS 16.2 RC build", date: "December 7, 2022" },
                                        { name: "iOS 16.2 final build", date: "December 13, 2022" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "16-3": {
                            label: "iOS 16.3",
                            releases: [
                                { name: "iOS 16.3 beta 1", date: "December 14, 2022", alignment: "left" },
                                { name: "iOS 16.3 beta 2", date: "January 10, 2023", alignment: "right" },
                                {
                                    pair: [
                                        { name: "iOS 16.3 RC build", date: "January 18, 2023" },
                                        { name: "iOS 16.3 final build", date: "January 23, 2023" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "iOS 16.3.1", date: "February 13, 2023" }
                            ]
                        },
                        "16-4": {
                            label: "iOS 16.4",
                            releases: [
                                { name: "iOS 16.4 beta 1", date: "February 16, 2023", alignment: "left" },
                                { name: "iOS 16.4 beta 2", date: "February 28, 2023", alignment: "right" },
                                { name: "iOS 16.4 beta 3", date: "March 7, 2023", alignment: "left" },
                                { name: "iOS 16.4 beta 4", date: "March 15, 2023", alignment: "right" },
                                {
                                    pair: [
                                        { name: "iOS 16.4 RC build", date: "March 21, 2023" },
                                        { name: "iOS 16.4 final build", date: "March 27, 2023" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "iOS 16.4.1", date: "April 7, 2023" }
                            ]
                        },
                        "16-5": {
                            label: "iOS 16.5",
                            releases: [
                                { name: "iOS 16.5 beta 1", date: "March 28, 2023", alignment: "left" },
                                { name: "iOS 16.5 beta 2", date: "April 11, 2023", alignment: "right" },
                                { name: "iOS 16.5 beta 3", date: "April 25, 2023", alignment: "left" },
                                { name: "iOS 16.5 beta 4", date: "May 2, 2023", alignment: "right" },
                                {
                                    pair: [
                                        { name: "iOS 16.5 RC build", date: "May 9, 2023", note: "build 2: May 15, 2023" },
                                        { name: "iOS 16.5 final build", date: "May 18, 2023" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name : "iOS 16.5.1", date: "June 21, 2023" }
                            ]
                        },
                        "16-6": {
                            label: "iOS 16.6",
                            releases: [
                                { name: "iOS 16.6 beta 1", date: "May 19, 2023", alignment: "left" },
                                { name: "iOS 16.6 beta 2", date: "May 31, 2023", alignment: "right" },
                                { name: "iOS 16.6 beta 3", date: "June 15, 2023", alignment: "left" },
                                { name: "iOS 16.6 beta 4", date: "June 27, 2023", alignment: "right" },
                                { name: "iOS 16.6 beta 5", date: "July 10, 2023", spanTwo: true },
                                {
                                    pair: [
                                        { name: "iOS 16.6 RC build", date: "July 18, 2023" },
                                        { name: "iOS 16.6 final build", date: "July 24, 2023" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "iOS 16.6.1", date: "September 7, 2023" }
                            ]
                        },
                        "16-7-x": {
                            label: "iOS 16.7.x",
                            releases: [
                                {
                                    trio: [
                                        { date: "iOS 16.7", note: "RC build: Sep 12, 2023\nFinal build: Sep 21, 2023" },
                                        { date: "iOS 16.7.1", note: "Final build: Oct 10, 2023" },
                                        { date: "iOS 16.7.2", note: "RC build: Oct 17, 2023\nFinal build: Oct 25, 2023"}
                                    ],
                                    className: "release-pair-compact"
                                },
                                {
                                    trio: [
                                        { date: "iOS 16.7.3", note: "RC build: Dec 5, 2023\nFinal build: Dec 11, 2023" },
                                        { date: "iOS 16.7.4", note: "Final build: Dec 19, 2023" },
                                        { date: "iOS 16.7.5", note: "RC build: Jan 17, 2024\nFinal build: Jan 22, 2024"}
                                    ],
                                    className: "release-pair-compact"
                                },
                                {
                                    trio: [
                                        { date: "iOS 16.7.6", note: "RC build: Feb 27, 2024\nFinal build: Mar 5, 2024" },
                                        { date: "iOS 16.7.7", note: "Final build: Mar 21, 2024" },
                                        { date: "iOS 16.7.8", note: "RC build: May 7, 2024\nFinal build: May 13, 2024"}
                                    ],
                                    className: "release-pair-compact"
                                },
                                {
                                    trio: [
                                        { date: "iOS 16.7.9", note: "RC build: Jul 23, 2024\nFinal build: Jul 29, 2024" },
                                        { date: "iOS 16.7.10", note: "Final build: Aug 7, 2024" },
                                        { date: "iOS 16.7.11", note: "Final build: Mar 31, 2025"}
                                    ],
                                    className: "release-pair-compact"
                                },
                                {
                                    trio: [
                                        { date: "iOS 16.7.12", note: "RC build: Sep 9, 2025\nFinal build: Sep 15, 2025" },
                                        { date: "iOS 16.7.13", note: "Final build: Jan 26, 2026" },
                                        { date: "iOS 16.7.14", note: "Final build: Feb 2, 2026"}
                                    ],
                                    className: "release-pair-compact"
                                },
                                {
                                    pair: [
                                        { date: "iOS 16.7.15", note: "Final build: Mar 11, 2026" },
                                        { date: "iOS 16.7.16", note: "Final build: May 11, 2026" }
                                    ],
                                    className: "release-pair-compact"
                                },
                            ]
                        }
                    };
            initializeTimelinePage(timelines);
        },
        "ios-17.html": () => {
            const timelines = {
                        "17-0": {
                            label: "iOS 17.0",
                            releases: [
                                { name: "iOS 17.0 beta 1", date: "June 5, 2023", alignment: "left" },
                                { name: "iOS 17.0 beta 2", date: "June 21, 2023", alignment: "right" },
                                { name: "iOS 17.0 beta 3", date: "July 5, 2023", note: "build 2: July 11, 2023", alignment: "left" },
                                { name: "iOS 17.0 beta 4", date: "July 25, 2023", note: "build 2: July 31, 2023", alignment: "right" },
                                { name: "iOS 17.0 beta 5", date: "August 8, 2023", alignment: "left" },
                                { name: "iOS 17.0 beta 6", date: "August 15, 2023", alignment: "right" },
                                { name: "iOS 17.0 beta 7", date: "August 22, 2023", alignment: "left" },
                                { name: "iOS 17.0 beta 8", date: "August 29, 2023", alignment: "right" },
                                {
                                    pair: [
                                        { name: "iOS 17.0 RC build", date: "September 12, 2023" },
                                        { name: "iOS 17.0 final build", date: "September 18, 2023" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                {
                                    trio: [
                                        { name: "iOS 17.0.1", date: "September 21, 2023" },
                                        { name: "iOS 17.0.2", date: "September 26, 2023" },
                                        { name: "iOS 17.0.3", date: "October 4, 2023" },
                                    ],
                                    className: "release-trio-tight"
                                }
                            ]
                        },
                        "17-1": {
                            label: "iOS 17.1",
                            releases: [
                                { name: "iOS 17.1 beta 1", date: "September 27, 2023", alignment: "left" },
                                { name: "iOS 17.1 beta 2", date: "October 3, 2023", alignment: "right" },
                                { name: "iOS 17.1 beta 3", date: "October 10, 2023", spanTwo: true },
                                {
                                    pair: [
                                        { name: "iOS 17.1 RC build", date: "October 17, 2023", note: "build 2: October 20, 2023" },
                                        { name: "iOS 17.1 final build", date: "October 25, 2023" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                {
                                    pair: [
                                        { name: "iOS 17.1.1", date: "November 7, 2023" },
                                        { name: "iOS 17.1.2", date: "November 30, 2023" },
                                    ],
                                    className: "release-pair-tight"
                                }
                            ]
                        },
                        "17-2": {
                            label: "iOS 17.2",
                            releases: [
                                { name: "iOS 17.2 beta 1", date: "October 26, 2023", alignment: "left" },
                                { name: "iOS 17.2 beta 2", date: "November 9, 2023", alignment: "right" },
                                { name: "iOS 17.2 beta 3", date: "November 14, 2023", alignment: "left" },
                                { name: "iOS 17.2 beta 4", date: "November 28, 2023", alignment: "right" },
                                {
                                    pair: [
                                        { name: "iOS 17.2 RC build", date: "December 5, 2023" },
                                        { name: "iOS 17.2 final build", date: "December 11, 2023" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "iOS 17.2.1", date: "December 19, 2023" }
                            ]
                        },
                        "17-3": {
                            label: "iOS 17.3",
                            releases: [
                                { name: "iOS 17.3 beta 1", date: "December 12, 2023", alignment: "left" },
                                { name: "iOS 17.3 beta 2", date: "January 3, 2024", alignment: "right" },
                                { name: "iOS 17.3 beta 3", date: "January 9, 2024", spanTwo: true },
                                {
                                    pair: [
                                        { name: "iOS 17.3 RC build", date: "January 17, 2024" },
                                        { name: "iOS 17.3 final build", date: "January 22, 2024" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "iOS 17.3.1", date: "February 8, 2024" },
                            ]
                        },
                        "17-4": {
                            label: "iOS 17.4",
                            releases: [
                                { name: "iOS 17.4 beta 1", date: "January 25, 2024", note: "build 2: January 30, 2024", alignment: "left" },
                                { name: "iOS 17.4 beta 2", date: "February 6, 2024", alignment: "right" },
                                { name: "iOS 17.4 beta 3", date: "February 13, 2024", alignment: "left" },
                                { name: "iOS 17.4 beta 4", date: "February 20, 2024", alignment: "right" },
                                {
                                    pair: [
                                        { name: "iOS 17.4 RC build", date: "February 27, 2024" },
                                        { name: "iOS 17.4 final build", date: "March 5, 2024" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "iOS 17.4.1", date: "March 21, 2024", note: "build 2: March 26, 2024"}
                            ]
                        },
                        "17-5": {
                            label: "iOS 17.5",
                            releases: [
                                { name: "iOS 17.5 beta 1", date: "April 2, 2024", alignment: "left" },
                                { name: "iOS 17.5 beta 2", date: "April 16, 2024", alignment: "right" },
                                { name: "iOS 17.5 beta 3", date: "April 23, 2024", alignment: "left" },
                                { name: "iOS 17.5 beta 4", date: "April 30, 2024", alignment: "right" },
                                {
                                    pair: [
                                        { name: "iOS 17.5 RC build", date: "May 7, 2024" },
                                        { name: "iOS 17.5 final build", date: "May 13, 2024" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "iOS 17.5.1", date: "May 20, 2024" }
                            ]
                        },
                        "17-6": {
                            label: "iOS 17.6",
                            releases: [
                                { name: "iOS 17.6 beta 1", date: "June 17, 2024", alignment: "left" },
                                { name: "iOS 17.6 beta 2", date: "July 1, 2024", alignment: "right" },
                                { name: "iOS 17.6 beta 3", date: "July 9, 2024", alignment: "left" },
                                { name: "iOS 17.6 beta 4", date: "July 16, 2024", alignment: "right"},
                                {
                                    pair: [
                                        { name: "iOS 17.6 RC build", date: "July 23, 2024" },
                                        { name: "iOS 17.6 final build", date: "July 29, 2024" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "iOS 17.6.1", date: "August 7, 2024", note: "build 2: August 19, 2024" },
                            ]
                        },
                        "17-7-x": {
                            label: "iOS 17.7.x",
                            releases: [
                                {
                                    trio: [
                                        { date: "iOS 17.7", note: "RC build: Sep 9, 2024\nFinal build: Sep 16, 2024" },
                                        { date: "iOS 17.7.1", note: "RC build: Oct 21, 2024\nFinal build: Oct 28, 2024" },
                                        { date: "iOS 17.7.2", note: "Final build: Nov 19, 2024" },
                                    ],
                                    className: "release-pair-compact"
                                },
                            ]
                        }
                    };
            initializeTimelinePage(timelines);
        },
        "ios-18.html": () => {
            const timelines = {
                        "18-0": {
                            label: "iOS 18.0",
                            releases: [
                                { name: "iOS 18.0 beta 1", date: "June 10, 2024", alignment: "left" },
                                { name: "iOS 18.0 beta 2", date: "June 24, 2024", alignment: "right" },
                                { name: "iOS 18.0 beta 3", date: "July 8, 2024", note: "build 2: July 15, 2024", alignment: "left" },
                                { name: "iOS 18.0 beta 4", date: "July 23, 2024", note: "build 2: July 26, 2024", alignment: "right" },
                                { name: "iOS 18.0 beta 5", date: "August 5, 2024", alignment: "left" },
                                { name: "iOS 18.0 beta 6", date: "August 12, 2024", alignment: "right" },
                                { name: "iOS 18.0 beta 7", date: "August 20, 2024", alignment: "left" },
                                { name: "iOS 18.0 beta 8", date: "August 28, 2024", alignment: "right" },
                                {
                                    pair: [
                                        { name: "iOS 18.0 RC build", date: "September 9, 2024" },
                                        { name: "iOS 18.0 final build", date: "September 16, 2024" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "iOS 18.0.1", date: "October 3, 2024" }
                            ]
                        },
                        "18-1": {
                            label: "iOS 18.1",
                            releases: [
                                { name: "iOS 18.1 beta 1", date: "July 29, 2024", alignment: "left" },
                                { name: "iOS 18.1 beta 2", date: "August 12, 2024", alignment: "right" },
                                { name: "iOS 18.1 beta 3", date: "August 28, 2024", alignment: "left" },
                                { name: "iOS 18.1 beta 4", date: "September 17, 2024", alignment: "right" },
                                { name: "iOS 18.1 beta 5", date: "September 23, 2024", alignment: "left" },
                                { name: "iOS 18.1 beta 6", date: "October 7, 2024", alignment: "right" },
                                { name: "iOS 18.1 beta 7", date: "October 14, 2024", spanTwo: true },
                                {
                                    pair: [
                                        { name: "iOS 18.1 RC build", date: "October 21, 2024" },
                                        { name: "iOS 18.1 final build", date: "October 28, 2024" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "iOS 18.1.1", date: "November 19, 2024" }
                            ]
                        },
                        "18-2": {
                            label: "iOS 18.2",
                            releases: [
                                { name: "iOS 18.2 beta 1", date: "October 23, 2024", alignment: "left" },
                                { name: "iOS 18.2 beta 2", date: "November 4, 2024", alignment: "right" },
                                { name: "iOS 18.2 beta 3", date: "November 11, 2024", alignment: "left" },
                                { name: "iOS 18.2 beta 4", date: "November 20, 2024", alignment: "right" },
                                {
                                    pair: [
                                        { name: "iOS 18.2 RC build", date: "December 5, 2024", note: "build 2: December 9, 2024" },
                                        { name: "iOS 18.2 final build", date: "December 11, 2024" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "iOS 18.2.1", date: "January 6, 2025" }
                            ]
                        },
                        "18-3": {
                            label: "iOS 18.3",
                            releases: [
                                { name: "iOS 18.3 beta 1", date: "December 16, 2024", alignment: "left" },
                                { name: "iOS 18.3 beta 2", date: "January 7, 2025", alignment: "right" },
                                { name: "iOS 18.3 beta 3", date: "January 16, 2025", spanTwo: true },
                                {
                                    pair: [
                                        { name: "iOS 18.3 RC build", date: "January 21, 2025" },
                                        { name: "iOS 18.3 final build", date: "January 27, 2025" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                {
                                    pair: [
                                        { name: "iOS 18.3.1", date: "February 10, 2025" },
                                        { name: "iOS 18.3.2", date: "March 11, 2025" },
                                    ],
                                    className: "release-pair-tight"
                                }
                            ]
                        },
                        "18-4": {
                            label: "iOS 18.4",
                            releases: [
                                { name: "iOS 18.4 beta 1", date: "February 21, 2025", alignment: "left" },
                                { name: "iOS 18.4 beta 2", date: "March 3, 2025", alignment: "right" },
                                { name: "iOS 18.4 beta 3", date: "March 10, 2025", alignment: "left" },
                                { name: "iOS 18.4 beta 4", date: "March 17, 2025", alignment: "right" },
                                {
                                    pair: [
                                        { name: "iOS 18.4 RC build", date: "March 24, 2025", note: "build 2: March 28, 2025" },
                                        { name: "iOS 18.4 final build", date: "March 31, 2025" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "iOS 18.4.1", date: "April 16, 2025" }
                            ]
                        },
                        "18-5": {
                            label: "iOS 18.5",
                            releases: [
                                { name: "iOS 18.5 beta 1", date: "April 2, 2025", alignment: "left" },
                                { name: "iOS 18.5 beta 2", date: "April 14, 2025", alignment: "right" },
                                { name: "iOS 18.5 beta 3", date: "April 21, 2025", alignment: "left" },
                                { name: "iOS 18.5 beta 4", date: "April 28, 2025", alignment: "right" },
                                {
                                    pair: [
                                        { name: "iOS 18.5 RC build", date: "May 6, 2025" },
                                        { name: "iOS 18.5 final build", date: "May 12, 2025" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ]
                        },
                        "18-6": {
                            label: "iOS 18.6",
                            releases: [
                                { name: "iOS 18.6 beta 1", date: "June 16, 2025", alignment: "left" },
                                { name: "iOS 18.6 beta 2", date: "June 30, 2025", alignment: "right" },
                                { name: "iOS 18.6 beta 3", date: "July 14, 2025", spanTwo: true },
                                {
                                    pair: [
                                        { name: "iOS 18.6 RC build", date: "July 21, 2025" },
                                        { name: "iOS 18.6 final build", date: "July 29, 2025" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                {
                                    pair: [
                                        { name: "iOS 18.6.1", date: "August 14, 2025" },
                                        { name: "iOS 18.6.2", date: "August 20, 2025" },
                                    ],
                                    className: "release-pair-tight"
                                }
                            ]
                        },
                        "18-7-x": {
                            label: "iOS 18.7.x",
                            releases: [
                                {
                                    quad: [
                                        { date: "iOS 18.7", note: "RC build: Sep 9, 2025\nFinal build: Sep 15, 2025" },
                                        { date: "iOS 18.7.1", note: "Final build: Sep 29, 2025" },
                                        { date: "iOS 18.7.2", note: "RC build: Oct 28, 2025\nFinal build: Nov 5, 2025" },
                                        { date: "iOS 18.7.3", note: "RC build: Dec 3, 2025\nFinal build: Dec 12, 2025" },                            
                                    ],
                                    className: "release-quad-tight"
                                },
                                {
                                    quad: [
                                        { date: "iOS 18.7.4", note: "Final build: Jan 26, 2026" },
                                        { date: "iOS 18.7.5", note: "RC build: Feb 4, 2026\nFinal build: Feb 11, 2026" },
                                        { date: "iOS 18.7.6", note: "Final build: Mar 4, 2026" },
                                        { date: "iOS 18.7.7", note: "RC build: Mar 18, 2026\nFinal build: Mar 24, 2026" },                            
                                    ],
                                    className: "release-quad-tight"
                                },
                                {
                                    trio: [
                                        { date: "iOS 18.7.8", note: "Final build: Apr 22, 2026" },
                                        { date: "iOS 18.7.9", note: "RC build: May 4, 2026\nFinal build: May 11, 2026" },
                                        { date: "iOS 18.7.10", note: "RC build: Aug 10, 2026\nFinal build: Aug 17, 2026" },                      
                                    ],
                                    className: "release-trio-tight"
                                },
                                { 
                                    pair: [
                                        { date: "iOS 18.7.11", note: "Final build: Oct 26, 2026" },
                                        { date: "iOS 18.7.12", note: "Final build: Nov 9, 2026" },
                                    ],
                                    className: "release-pair-tight"
                                },
                            ]
                        }
                    };
            initializeTimelinePage(timelines);
        },
        "ios-26.html": () => {
            const timelines = {
                        "26-0": {
                            label: "iOS 26.0",
                            releases: [
                                { name: "iOS 26.0 beta 1", date: "Jun 9, 2025" },
                                { name: "iOS 26.0 beta 2", date: "Jun 23, 2025" },
                                { name: "iOS 26.0 beta 3", date: "Jul 7, 2025" },
                                { name: "iOS 26.0 beta 4", date: "Jul 22, 2025", note: "build 2: Jul 24, 2025" },
                                { name: "iOS 26.0 beta 5", date: "Aug 5, 2025" },
                                { name: "iOS 26.0 beta 6", date: "Aug 11, 2025", note: "build 2: Aug 14, 2025" },
                                { name: "iOS 26.0 beta 7", date: "Aug 18, 2025" },
                                { name: "iOS 26.0 beta 8", date: "Aug 25, 2025" },
                                { name: "iOS 26.0 beta 9", date: "Sep 2, 2025", spanTwo: true },
                                {
                                    pair: [
                                        { name: "iOS 26.0 RC build", date: "Sep 9, 2025" },
                                        { name: "iOS 26.0 final build", date: "Sep 15, 2025" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "iOS 26.0.1", date: "Sep 29, 2025" }
                            ]
                        },
                        "26-1": {
                            label: "iOS 26.1",
                            releases: [
                                { name: "iOS 26.1 beta 1", date: "Sep 22, 2025" },
                                { name: "iOS 26.1 beta 2", date: "Oct 6, 2025" },
                                { name: "iOS 26.1 beta 3", date: "Oct 13, 2025" },
                                { name: "iOS 26.1 beta 4", date: "Oct 20, 2025" },
                                {
                                    pair: [
                                        { name: "iOS 26.1 RC build", date: "Oct 28, 2025" },
                                        { name: "iOS 26.1 final build", date: "Nov 3, 2025" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ]
                        },
                        "26-2": {
                            label: "iOS 26.2",
                            releases: [
                                { name: "iOS 26.2 beta 1", date: "Nov 4, 2025" },
                                { name: "iOS 26.2 beta 2", date: "Nov 12, 2025" },
                                { name: "iOS 26.2 beta 3", date: "Nov 17, 2025", spanTwo: true },
                                {
                                    pair: [
                                        { name: "iOS 26.2 RC build", date: "Dec 3, 2025", note: "build 2: Dec 8, 2025" },
                                        { name: "iOS 26.2 final build", date: "Dec 12, 2025" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "iOS 26.2.1", date: "Jan 26, 2026" }
                            ]
                        },
                        "26-3": {
                            label: "iOS 26.3",
                            releases: [
                                { name: "iOS 26.3 beta 1", date: "Dec 15, 2025" },
                                { name: "iOS 26.3 beta 2", date: "Jan 12, 2026" },
                                { name: "iOS 26.3 beta 3", date: "Jan 26, 2026", spanTwo: true },
                                {
                                    pair: [
                                        { name: "iOS 26.3 RC build", date: "Feb 4, 2026" },
                                        { name: "iOS 26.3 final build", date: "Feb 11, 2026" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "iOS 26.3.1", date: "Mar 4, 2026" }
                            ]
                        },
                        "26-4": {
                            label: "iOS 26.4",
                            releases: [
                                { name: "iOS 26.4 beta 1", date: "Feb 16, 2026" },
                                { name: "iOS 26.4 beta 2", date: "Feb 23, 2026" },
                                { name: "iOS 26.4 beta 3", date: "Mar 2, 2026", note: "build 2: Mar 5, 2026" },
                                { name: "iOS 26.4 beta 4", date: "Mar 9, 2026" },
                                {
                                    pair: [
                                        { name: "iOS 26.4 RC build", date: "Mar 18, 2026" },
                                        { name: "iOS 26.4 final build", date: "Mar 24, 2026" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                {
                                    pair: [
                                        { name: "iOS 26.4.1", date: "Apr 8, 2026" },
                                        { name: "iOS 26.4.2", date: "Apr 22, 2026" }
                                    ],
                                    className: "release-pair-tight"
                                }
                            ]
                        },
                        "26-5": {
                            label: "iOS 26.5",
                            footnote: "1: Released only for iPhone 17 models and iPhone Air.",
                            releases: [
                                { name: "iOS 26.5 beta 1", date: "Mar 30, 2026", note: "build 2: Apr 3, 2026" },
                                { name: "iOS 26.5 beta 2", date: "Apr 13, 2026" },
                                { name: "iOS 26.5 beta 3", date: "Apr 20, 2026" },
                                { name: "iOS 26.5 beta 4", date: "Apr 27, 2026" },
                                {
                                    pair: [
                                        { name: "iOS 26.5 RC build", date: "May 4, 2026", note: "build 2: May 8, 2026" },
                                        { name: "iOS 26.5 final build", date: "May 11, 2026" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                {
                                    pair: [
                                        { name: "iOS 26.5.1&#185;", date: "Jun 1, 2026" },
                                        { name: "iOS 26.5.2", date: "Jun 29, 2026" }
                                    ],
                                    className: "release-pair-tight"
                                }
                            ]
                        },
                        "26-6": {
                            label: "iOS 26.6",
                            releases: [
                                { name: "iOS 26.6 beta 1", date: "May 26, 2026" },
                                { name: "iOS 26.6 beta 2", date: "Jun 15, 2026" },
                                { name: "iOS 26.6 beta 3", date: "Jun 29, 2026" },
                                { name: "iOS 26.6 beta 4", date: "Jul 6, 2026" },
                                { name: "iOS 26.6 beta 5", date: "Jul 13, 2026", spanTwo: true },
                                {
                                    pair: [
                                        { name: "iOS 26.6 RC build", date: "Jul 20, 2026" },
                                        { name: "iOS 26.6 final build", date: "Jul 27, 2026" }
            
                                    ],
                                    className: "release-pair-builds"
                                },
                            ],
                            supplemental: [
                                { 
                                    pair: [
                                        { date: "iOS 26.6.1", note: "RC build: Aug 10, 2026\nFinal build: Aug 17, 2026" },
                                        { date: "iOS 26.6.2", note: "Final build: Sep 8, 2026" },
                                    ],
                                    className: "release-pair-tight"
                                }
                            ]
                        },
                        "26-7-x": {
                            label: "iOS 26.7.x",
                            releases: [
                                {
                                    pair: [
                                        { date: "iOS 26.7", note: "RC build: Sep 9, 2026\nFinal build: Sep 14, 2026" },
                                        { date: "iOS 26.7.1", note: "Final build: Sep 28, 2026" },
                                    ],
                                    className: "release-pair-tight"
                                },
                                {
                                    pair: [
                                        { date: "iOS 26.7.2", note: "RC build: Oct 19, 2026\nFinal build: Oct 26, 2026" },
                                        { date: "iOS 26.7.3", note: "Final build: Nov 9, 2026" },
                                    ],
                                    className: "release-pair-tight"
                                },
                            ]
                        }
                    };
            initializeTimelinePage(timelines);
        },
        "ios-27.html": () => {
            const timelines = {
                        "27-0": {
                            label: "iOS 27.0",
                            releases: [
                                { name: "iOS 27.0 beta 1", date: "Jun 8, 2026" },
                                { name: "iOS 27.0 beta 2", date: "Jun 22, 2026" },
                                { name: "iOS 27.0 beta 3", date: "Jul 6, 2026" },
                                { name: "iOS 27.0 beta 4", date: "Jul 20, 2026" },
                                { name: "iOS 27.0 beta 5", date: "Aug 10, 2026" },
                                { name: "iOS 27.0 beta 6", date: "Aug 17, 2026" },
                                { name: "iOS 27.0 beta 7", date: "Aug 24, 2026" },
                                { name: "iOS 27.0 beta 8", date: "Aug 31, 2026" },
                                {
                                    pair: [
                                        { name: "iOS 27.0 RC build", date: "Sep 9, 2026" },
                                        { name: "iOS 27.0 final build", date: "Sep 14, 2026" },
                                    ],
                                    className: "release-pair-builds"
                                },
                            ],
                            supplemental: [
                                { name: "iOS 27.0.1", date: "Sep 28, 2026" },
                            ]
                        },
                        "27-2": {
                            label: "iOS 27.2",
                            releases: [
                                { name: "iOS 27.2 beta 1", date: "Sep 16, 2026" },
                                { name: "iOS 27.2 beta 2", date: "Sep 21, 2026" },
                                { name: "iOS 27.2 beta 3", date: "Oct 5, 2026" },
                                { name: "iOS 27.2 beta 4", date: "Oct 13, 2026" },
                                {
                                    pair: [
                                        { name: "iOS 27.2 RC build", date: "Oct 19, 2026" },
                                        { name: "iOS 27.2 final build", date: "Oct 26, 2026" },
                                    ],
                                    className: "release-pair-builds"
                                },
                            ],
                            supplemental: [
                                { name: "iOS 27.2.1", date: "Nov 9, 2026" },
                            ]
                        },
                        "27-3": {
                            label: "iOS 27.3",
                            releases: [
                                { name: "iOS 27.3 beta 1", date: "Nov 3, 2026", spanTwo: true },
                            ]
                        }
                    };
            initializeTimelinePage(timelines);
        },
        "ios-6.html": () => {
            const timelines = {
                        "6-0": {
                            label: "iOS 6.0",
                            releases: [
                                { name: "iOS 6.0 beta 1", date: "June 11, 2012", alignment: "left" },
                                { name: "iOS 6.0 beta 2", date: "June 25, 2012", alignment: "right" },
                                { name: "iOS 6.0 beta 3", date: "July 16, 2012", alignment: "left" },
                                { name: "iOS 6.0 beta 4", date: "August 6, 2012", alignment: "right" },
                                {
                                    pair: [
                                        { name: "iOS 6.0 final build", date: "August 27, 2012", note: "build 2: September 19, 2012" },
                                        { name: "iOS 6.0 GM build", date: "September 12, 2012" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                {
                                    pair: [
                                        { name: "iOS 6.0.1", date: "October 29, 2012" },
                                        { name: "iOS 6.0.2", date: "December 13, 2012" },
                                    ],
                                    className: "release-pair-tight"
                                }
                            ]
                        },
                        "6-1": {
                            label: "iOS 6.1",
                            releases: [
                                { name: "iOS 6.1 beta 1", date: "November 1, 2012", alignment: "left" },
                                { name: "iOS 6.1 beta 2", date: "November 12, 2012", alignment: "right" },
                                { name: "iOS 6.1 beta 3", date: "December 3, 2012", alignment: "left" },
                                { name: "iOS 6.1 beta 4", date: "December 17, 2012", alignment: "right" },
                                {
                                    pair: [
                                        { name: "iOS 6.1 final build", date: "January 7, 2013", note: "build 2: January 28, 2013" },
                                        { name: "iOS 6.1 GM build", date: "January 26, 2013" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                {
                                    pair: [
                                        { date: "iOS 6.1.1 + 6.1.3", note: "6.1.1 beta 1: Feb 6, 2013\n6.1.1 final build: Feb 11, 2013\n6.1.3 beta 2: Feb 21, 2013\n6.1.3 final build: Mar 13, 2013" },
                                        { date: "iOS 6.1.2", note: "Feb 19, 2013" }
                                    ],
                                    className: "release-pair-tight"
                                },
                                {
                                    trio: [
                                        { date: "iOS 6.1.4", note: "Apr 27, 2013" },
                                        { date: "iOS 6.1.5", note: "Nov 14, 2013" },
                                        { date: "iOS 6.1.6", note: "Feb 21, 2014" },
                                    ],
                                    className: "release-trio-tight"
                                },
                            ]
                        },
                    };
            initializeTimelinePage(timelines);
        },        
        "ios-7.html": () => {
            const timelines = {
                        "7-0": {
                            label: "iOS 7.0",
                            footnote: "1: iPhone 5c + 5s only",
                            releases: [
                                { name: "iOS 7.0 beta 1", date: "June 10, 2013", alignment: "left" },
                                { name: "iOS 7.0 beta 2", date: "June 24, 2013", alignment: "right" },
                                { name: "iOS 7.0 beta 3", date: "July 8, 2013", note: "build 2: July 11, 2013", alignment: "left" },
                                { name: "iOS 7.0 beta 4", date: "July 29, 2013", alignment: "right" },
                                { name: "iOS 7.0 beta 5", date: "August 6, 2013", alignment: "left" },
                                { name: "iOS 7.0 beta 6", date: "August 15, 2013", alignment: "right" },
                                {
                                    pair: [
                                        { name: "iOS 7.0 GM build", date: "September 10, 2013" },
                                        { name: "iOS 7.0 final build", date: "September 18, 2013" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                {
                                    trio: [
                                        { name: "iOS 7.0.1&#185;", date: "September 18, 2013" },
                                        { name: "iOS 7.0.2", date: "September 26, 2013" },
                                        { name: "iOS 7.0.3", date: "October 22, 2013" },
                                    ],
                                    className: "release-trio-tight"
                                },
                                {
                                    trio: [
                                        { name: "iOS 7.0.4", date: "November 14, 2013"},
                                        { name: "iOS 7.0.5&#185;", date: "January 29, 2014" },
                                        { name: "iOS 7.0.6", date: "February 21, 2014" }
                                    ],
                                    className: "release-trio-tight"
                                }
                            ]
                        },
                        "7-1": {
                            label: "iOS 7.1",
                            releases: [
                                { name: "iOS 7.1 beta 1", date: "November 18, 2013", alignment: "left" },
                                { name: "iOS 7.1 beta 2", date: "December 14, 2013", alignment: "right" },
                                { name: "iOS 7.1 beta 3", date: "January 7, 2014", alignment: "left" },
                                { name: "iOS 7.1 beta 4", date: "January 20, 2014", alignment: "right" },
                                { name: "iOS 7.1 beta 5", date: "February 4, 2014", spanTwo: true },
                                {
                                    pair: [
                                        { name: "iOS 7.1 GM build", date: "March 10, 2014", },
                                        { name: "iOS 7.1 final build", date: "March 10, 2014", }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                {
                                    trio: [
                                        { name: "iOS 7.1.1", date: "April 22, 2014" },
                                        { name: "iOS 7.1.2", date: "June 30, 2014" }
                                    ],
                                    className: "release-pair-tight"
                                }
                            ]
                        },
                    };
            initializeTimelinePage(timelines);
        },
        "ios-8.html": () => {
            const timelines = {
                        "8-0": {
                            label: "iOS 8.0",
                            releases: [
                                { name: "iOS 8.0 beta 1", date: "June 2, 2014", alignment: "left" },
                                { name: "iOS 8.0 beta 2", date: "June 17, 2014", alignment: "right" },
                                { name: "iOS 8.0 beta 3", date: "July 7, 2014", alignment: "left" },
                                { name: "iOS 8.0 beta 4", date: "July 21, 2014", alignment: "right" },
                                { name: "iOS 8.0 beta 5", date: "August 4, 2014", spanTwo: true },
                                {
                                    pair: [
                                        { name: "iOS 8.0 GM build", date: "September 9, 2014" },
                                        { name: "iOS 8.0 final build", date: "September 17, 2014" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                {
                                    pair: [
                                        { name: "iOS 8.0.1", date: "September 24, 2014" },
                                        { name: "iOS 8.0.2", date: "September 25, 2014" }
                                    ],
                                    className: "release-pair-tight"
                                }
                            ]
                        },
                        "8-1": {
                            label: "iOS 8.1",
                            releases: [
                                { name: "iOS 8.1 beta 1", date: "September 29, 2014", alignment: "left" },
                                { name: "iOS 8.1 beta 2", date: "October 7, 2014", alignment: "right" },
                                { name: "iOS 8.1 final build", date: "October 20, 2014", spanTwo: true }
                            ],
                            supplemental: [
                                {
                                    trio: [
                                        { date: "iOS 8.1.1", note: "beta 1: Nov 3, 2014\nfinal build: Nov 17, 2014" },
                                        { date: "iOS 8.1.2", note: "final build: Dec 9, 2014" },
                                        { date: "iOS 8.1.3", note: "final build: Jan 27, 2015" }
                                    ]
                                }
                            ]
                        },
                        "8-2": {
                            label: "iOS 8.2",
                            releases: [
                                { name: "iOS 8.2 beta 1", date: "November 18, 2014", alignment: "left" },
                                { name: "iOS 8.2 beta 2", date: "December 10, 2014", alignment: "right" },
                                { name: "iOS 8.2 beta 3", date: "December 18, 2014", alignment: "left" },
                                { name: "iOS 8.2 beta 4", date: "January 12, 2015", alignment: "right" },
                                { name: "iOS 8.2 beta 5", date: "February 2, 2015", spanTwo: true },
                                { name: "iOS 8.2 final build", date: "March 9, 2015", spanTwo: true }
                            ],
                        },
                        "8-3": {
                            label: "iOS 8.3",
                            releases: [
                                { name: "iOS 8.3 beta 1", date: "February 9, 2015", alignment: "left" },
                                { name: "iOS 8.3 beta 2", date: "February 23, 2015", alignment: "right" },
                                { name: "iOS 8.3 beta 3", date: "March 12, 2015", alignment: "left" },
                                { name: "iOS 8.3 beta 4", date: "March 24, 2015", alignment: "right" },
                                { name: "iOS 8.3 final build", date: "April 8, 2015", spanTwo: true }
                            ],
                        },
                        "8-4": {
                            label: "iOS 8.4",
                            releases: [
                                { name: "iOS 8.4 beta 1", date: "April 13, 2015", alignment: "left" },
                                { name: "iOS 8.4 beta 2", date: "April 27, 2015", alignment: "right" },
                                { name: "iOS 8.4 beta 3", date: "May 11, 2015", alignment: "left" },
                                { name: "iOS 8.4 beta 4", date: "June 9, 2015", alignment: "right" },
                                { name: "iOS 8.4 final build", date: "June 30, 2015", spanTwo: true }
                            ],
                            supplemental: [
                                { date: "iOS 8.4.1", note: "beta 1: Jul 14, 2015\nbeta 2: Jul 30, 2015\nfinal build: Aug 13, 2015" }
                            ]
                        },
                    };
            initializeTimelinePage(timelines);
        },
        "ios-9.html": () => {
            const timelines = {
                        "9-0": {
                            label: "iOS 9-0",
                            releases: [
                                { name: "iOS 9.0 beta 1", date: "June 8, 2015", alignment: "left" },
                                { name: "iOS 9.0 beta 2", date: "June 23, 2015", alignment: "right" },
                                { name: "iOS 9.0 beta 3", date: "July 8, 2015", alignment: "left" },
                                { name: "iOS 9.0 beta 4", date: "July 21, 2015", alignment: "right" },
                                { name: "iOS 9.0 beta 5", date: "August 6, 2015", spanTwo: true },
                                {
                                    pair: [
                                        { name: "iOS 9.0 GM build", date: "September 9, 2015" },
                                        { name: "iOS 9.0 final build", date: "September 16, 2015" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                {
                                    pair: [
                                        { name: "iOS 9.0.1", date: "September 23, 2015" },
                                        { name: "iOS 9.0.2", date: "September 30, 2015" }
                                    ],
                                    className: "release-pair-tight"
                                }
                            ]
                        },
                        "9-1": {
                            label: "iOS 9.1",
                            releases: [
                                { name: "iOS 9.1 beta 1", date: "September 9, 2015", alignment: "left" },
                                { name: "iOS 9.1 beta 2", date: "September 23, 2015", alignment: "right" },
                                { name: "iOS 9.1 beta 3", date: "September 30, 2015", alignment: "left" },
                                { name: "iOS 9.1 beta 4", date: "October 6, 2015", alignment: "right" },
                                { name: "iOS 9.1 beta 5", date: "October 12, 2015", spanTwo: true },
                                { name: "iOS 9.1 final build", date: "October 21, 2015", spanTwo: true }
                            ],
                        },
                        "9-2": {
                            label: "iOS 9.2",
                            releases: [
                                { name: "iOS 9.2 beta 1", date: "October 27, 2015", alignment: "left" },
                                { name: "iOS 9.2 beta 2", date: "November 3, 2015", alignment: "right" },
                                { name: "iOS 9.2 beta 3", date: "November 10, 2015", alignment: "left" },
                                { name: "iOS 9.2 beta 4", date: "November 18, 2015", alignment: "right" },
                                { name: "iOS 9.2 final build", date: "December 8, 2015", spanTwo: true }
                            ],
                        },
                        "9-2-1": {
                            label: "iOS 9.2.1",
                            releases: [
                                { name: "iOS 9.2.1 beta 1", date: "December 16, 2015", alignment: "left" },
                                { name: "iOS 9.2.1 beta 2", date: "January 4, 2016", alignment: "right" },
                                { name: "iOS 9.2.1 final build", date: "January 19, 2016", spanTwo: true }
                            ],
                        },
                        "9-3": {
                            label: "iOS 9.3",
                            releases: [
                                { name: "iOS 9.3 beta 1", date: "January 11, 2016", note: "beta 1.1: January 14, 2016", alignment: "left" },
                                { name: "iOS 9.3 beta 2", date: "January 25, 2016", alignment: "right" },
                                { name: "iOS 9.3 beta 3", date: "February 8, 2016", alignment: "left" },
                                { name: "iOS 9.3 beta 4", date: "February 22, 2016", alignment: "right" },
                                { name: "iOS 9.3 beta 5", date: "March 1, 2016", alignment: "left" },
                                { name: "iOS 9.3 beta 6", date: "March 7, 2016", alignment: "right" },
                                { name: "iOS 9.3 beta 7", date: "March 14, 2016", spanTwo: true },
                                { name: "iOS 9.3 final build", date: "March 21, 2016", spanTwo: true }
                            ],
                            supplemental: [
                                { name: "iOS 9.3.1", date: "March 31, 2016" }
                            ]
                        },
                        "9-3-2": {
                            label: "iOS 9.3.2",
                            releases: [
                                { name: "iOS 9.3.2 beta 1", date: "April 6, 2016", alignment: "left" },
                                { name: "iOS 9.3.2 beta 2", date: "April 20, 2016", alignment: "right" },
                                { name: "iOS 9.3.2 beta 3", date: "April 26, 2016", alignment: "left" },
                                { name: "iOS 9.3.2 beta 4", date: "May 3, 2016", alignment: "right" },
                                { name: "iOS 9.3.2 final build", date: "May 16, 2016", spanTwo: true }
                            ],
                        },
                        "9-3-3": {
                            label: "iOS 9.3.3",
                            releases: [
                                { name: "iOS 9.3.3 beta 1", date: "May 23, 2016", alignment: "left" },
                                { name: "iOS 9.3.3 beta 2", date: "June 6, 2016", alignment: "right" },
                                { name: "iOS 9.3.3 beta 3", date: "June 21, 2016", alignment: "left" },
                                { name: "iOS 9.3.3 beta 4", date: "June 29, 2016", alignment: "right" },
                                { name: "iOS 9.3.3 beta 5", date: "July 6, 2016", spanTwo: true },
                                { name: "iOS 9.3.3 final build", date: "July 18, 2016", spanTwo: true }
                            ],
                            supplemental: [
                                {
                                    pair: [
                                        { name: "iOS 9.3.4", date: "August 4, 2016" },
                                        { name: "iOS 9.3.5", date: "August 25, 2016" }
                                    ],
                                    className: "release-pair-tight"
                                }
                            ]
                        },
                    };
            initializeTimelinePage(timelines);
        },
        "ipados-13.html": () => {
            const timelines = {
                        "13-0": {
                            label: "iPadOS 13.0",
                            releases: [
                                { name: "iPadOS 13.0 beta 1", date: "June 3, 2019", alignment: "left" },
                                { name: "iPadOS 13.0 beta 2", date: "June 17, 2019", alignment: "right" },
                                { name: "iPadOS 13.0 beta 3", date: "July 2, 2019", note: "build 2: July 8, 2019", alignment: "left" },
                                { name: "iPadOS 13.0 beta 4", date: "July 17, 2019", alignment: "right" },
                                { name: "iPadOS 13.0 beta 5", date: "July 29, 2019", alignment: "left" },
                                { name: "iPadOS 13.0 beta 6", date: "August 7, 2019", alignment: "right" },
                                { name: "iPadOS 13.0 beta 7", date: "August 15, 2019", alignment: "left" },
                                { name: "iPadOS 13.0 beta 8", date: "August 21, 2019", alignment: "right" },
                            ],
                            intro: "iPadOS 13 released as iPadOS 13.1 on Sep 24, 2019. See 'iPadOS 13.1' for more."
                        },
                        "13-1": {
                            label: "iPadOS 13.1",
                            supplementalIntro: "iPadOS 13 released as iPadOS 13.1.",
                            releases: [
                                { name: "iPadOS 13.1 beta 1", date: "August 27, 2019", alignment: "left" },
                                { name: "iPadOS 13.1 beta 2", date: "September 4, 2019", alignment: "right" },
                                { name: "iPadOS 13.1 beta 3", date: "September 10, 2019", alignment: "left" },
                                { name: "iPadOS 13.1 beta 4", date: "September 18, 2019", alignment: "right" },
                                { name: "iPadOS 13.1 final build", date: "September 24, 2019", spanTwo: true }
                            ],
            
                            supplemental: [
                                {
                                    trio: [
                                        { name: "iPadOS 13.1.1", date: "September 27, 2019" },
                                        { name: "iPadOS 13.1.2", date: "September 30, 2019" },
                                        { name: "iPadOS 13.1.3", date: "October 15, 2019" }
                                    ]
                                }
                            ]
                        },
                        "13-2": {
                            label: "iPadOS 13.2",
                            releases: [
                                { name: "iPadOS 13.2 beta 1", date: "October 2, 2019", alignment: "left" },
                                { name: "iPadOS 13.2 beta 2", date: "October 10, 2019", alignment: "right" },
                                { name: "iPadOS 13.2 beta 3", date: "October 16, 2019", alignment: "left" },
                                { name: "iPadOS 13.2 beta 4", date: "October 23, 2019", alignment: "right" },
                                { name: "iPadOS 13.2 final build", date: "October 28, 2019", spanTwo: true }
                            ],
                            supplemental: [
                                { pair: [
                                        { name: "iPadOS 13.2.2", date: "November 7, 2019" },
                                        { name: "iPadOS 13.2.3", date: "November 18, 2019" },
                                    ],
                                    className: "release-pair-tight"
                                }
                            ]
                        },
                        "13-3": {
                            label: "iPadOS 13.3",
                            releases: [
                                { name: "iPadOS 13.3 beta 1", date: "November 5, 2019", alignment: "left" },
                                { name: "iPadOS 13.3 beta 2", date: "November 12, 2019", alignment: "right" },
                                { name: "iPadOS 13.3 beta 3", date: "November 20, 2019", alignment: "left" },
                                { name: "iPadOS 13.3 beta 4", date: "December 5, 2019", alignment: "right" },
                                { name: "iPadOS 13.3 final build", date: "December 10, 2019", spanTwo: true }
                            ],
                        },
                        "13-3-1": {
                            label: "iPadOS 13.3.1",
                            releases: [
                                { name: "iPadOS 13.3.1 beta 1", date: "December 17, 2019", alignment: "left" },
                                { name: "iPadOS 13.3.1 beta 2", date: "January 14, 2020", alignment: "right" },
                                { name: "iPadOS 13.3.1 beta 3", date: "January 22, 2020", spanTwo: true },
                                { name: "iPadOS 13.3.1 final build", date: "January 28, 2020", spanTwo: true }
                            ],
                        },
                        "13-4": {
                            label: "iPadOS 13.4",
                            releases: [
                                { name: "iPadOS 13.4 beta 1", date: "February 5, 2020", alignment: "left" },
                                { name: "iPadOS 13.4 beta 2", date: "February 19, 2020", alignment: "right" },
                                { name: "iPadOS 13.4 beta 3", date: "February 26, 2020", alignment: "left" },
                                { name: "iPadOS 13.4 beta 4", date: "March 3, 2020", alignment: "right" },
                                { name: "iPadOS 13.4 beta 5", date: "March 10, 2020", alignment: "left" },
                                { name: "iPadOS 13.4 beta 6", date: "March 18, 2020", alignment: "right" },
                                { name: "iPadOS 13.4 final build", date: "March 24, 2020", spanTwo: true }
                            ],
                            supplemental: [
                                { name: "iPadOS 13.4.1", date: "April 7, 2020" }
                            ]
                        },
                        "13-5": {
                            label: "iPadOS 13.4.5 + 13.5",
                            releases: [
                                { name: "iPadOS 13.4.5 beta 1", date: "March 31, 2020", alignment: "left" },
                                { name: "iPadOS 13.4.5 beta 2", date: "April 15, 2020", alignment: "right" },
                                { name: "iPadOS 13.5 beta 3", date: "April 29, 2020", alignment: "left" },
                                { name: "iPadOS 13.5 beta 4", date: "May 6, 2020", alignment: "right" },
                                {
                                    pair: [
                                        { name: "iPadOS 13.5 GM build", date: "May 18, 2020" },
                                        { name: "iPadOS 13.5 final build", date: "May 20, 2020" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "iPadOS 13.5.1", date: "June 1, 2020" }
                            ]
                        },
                        "13-6": {
                            label: "iPadOS 13.5.5 + 13.6",
                            releases: [
                                { name: "iPadOS 13.5.5 beta 1", date: "June 1, 2020", spanTwo: true },
                                { name: "iPadOS 13.6 beta 2", date: "June 9, 2020", alignment: "left" },
                                { name: "iPadOS 13.6 beta 3", date: "June 30, 2020", alignment: "right" },
                                {
                                    pair: [
                                        { name: "iPadOS 13.6 GM build", date: "July 9, 2020" },
                                        { name: "iPadOS 13.6 final build", date: "July 15, 2020" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "iPadOS 13.6.1", date: "August 12, 2020" }
                            ]
                        },
                        "13-7": {
                            label: "iPadOS 13.7",
                            releases: [
                                {
                                    pair: [
                                        { name: "iPadOS 13.7 beta 1", date: "August 26, 2020" },
                                        { name: "iPadOS 13.7 final build", date: "September 1, 2020" }
                                    ],
                                    className: "release-pair-builds"
                                },
                            ]
                        },
                    };
            initializeTimelinePage(timelines);
        },
        "ipados-14.html": () => {
            const timelines = {
                        "14-0": {
                            label: "iPadOS 14.0",
                            releases: [
                                { name: "iPadOS 14.0 beta 1", date: "June 22, 2020", alignment: "left" },
                                { name: "iPadOS 14.0 beta 2", date: "July 7, 2020", alignment: "right" },
                                { name: "iPadOS 14.0 beta 3", date: "July 22, 2020", alignment: "left" },
                                { name: "iPadOS 14.0 beta 4", date: "August 4, 2020", alignment: "right" },
                                { name: "iPadOS 14.0 beta 5", date: "August 18, 2020", alignment: "left" },
                                { name: "iPadOS 14.0 beta 6", date: "August 25, 2020", alignment: "right" },
                                { name: "iPadOS 14.0 beta 7", date: "September 3, 2020", alignment: "left" },
                                { name: "iPadOS 14.0 beta 8", date: "September 9, 2020", alignment: "right" },
                                {
                                    pair: [
                                        { name: "iPadOS 14.0 GM build", date: "September 15, 2020" },
                                        { name: "iPadOS 14.0 final build", date: "September 16, 2020" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "iPadOS 14.0.1", date: "September 24, 2020" }
                            ]
                        },
                        "14-1": {
                            label: "iPadOS 14.1",
                            releases: [
                                { pair: [
                                        { name: "iPadOS 14.1 GM build", date: "October 13, 2020" },
                                        { name: "iPadOS 14.1 final build", date: "October 20, 2020" }
                                    ],
                                    className: "release-pair-tight"
                                }
                            ],
                        },
                        "14-2": {
                            label: "iPadOS 14.2",
                            releases: [
                                { name: "iPadOS 14.2 beta 1", date: "September 17, 2020", alignment: "left" },
                                { name: "iPadOS 14.2 beta 2", date: "September 29, 2020", alignment: "right" },
                                { name: "iPadOS 14.2 beta 3", date: "October 13, 2020", alignment: "left" },
                                { name: "iPadOS 14.2 beta 4", date: "October 20, 2020", alignment: "right" },
                                {
                                    pair: [
                                        { name: "iPadOS 14.2 RC build", date: "October 30, 2020" },
                                        { name: "iPadOS 14.2 final build", date: "November 5, 2020" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "14-3": {
                            label: "iPadOS 14.3",
                            releases: [
                                { name: "iPadOS 14.3 beta 1", date: "November 12, 2020", alignment: "left" },
                                { name: "iPadOS 14.3 beta 2", date: "November 17, 2020", alignment: "right" },
                                { name: "iPadOS 14.3 beta 3", date: "December 2, 2020", spanTwo: true },
                                {
                                    pair: [
                                        { name: "iPadOS 14.3 RC build", date: "December 8, 2020", note: "build 2: December 10, 2020" },
                                        { name: "iPadOS 14.3 final build", date: "December 14, 2020" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "14-4": {
                            label: "iPadOS 14.4",
                            releases: [
                                { name: "iPadOS 14.4 beta 1", date: "December 16, 2020", alignment: "left" },
                                { name: "iPadOS 14.4 beta 2", date: "January 13, 2021", alignment: "right" },
                                {
                                    pair: [
                                        { name: "iPadOS 14.4 RC build", date: "January 21, 2021" },
                                        { name: "iPadOS 14.4 final build", date: "January 26, 2021" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { pair: [
                                        { name: "iPadOS 14.4.1", date: "March 8, 2021" },
                                        { name: "iPadOS 14.4.2", date: "March 26, 2021" }
                                    ],
                                    className: "release-pair-tight" }
                            ]
                        },
                        "14-5": {
                            label: "iPadOS 14.5",
                            releases: [
                                { name: "iPadOS 14.5 beta 1", date: "February 1, 2021", note: "build 2: February 4, 2021", alignment: "left" },
                                { name: "iPadOS 14.5 beta 2", date: "February 16, 2021", alignment: "right" },
                                { name: "iPadOS 14.5 beta 3", date: "March 2, 2021", alignment: "left" },
                                { name: "iPadOS 14.5 beta 4", date: "March 15, 2021", alignment: "right" },
                                { name: "iPadOS 14.5 beta 5", date: "March 23, 2021", alignment: "left" },
                                { name: "iPadOS 14.5 beta 6", date: "March 31, 2021", alignment: "right" },
                                { name: "iPadOS 14.5 beta 7", date: "April 7, 2021", alignment: "left" },
                                { name: "iPadOS 14.5 beta 8", date: "April 13, 2021", alignment: "right" },
                                {
                                    pair: [
                                        { name: "iPadOS 14.5 RC build", date: "April 20, 2021" },
                                        { name: "iPadOS 14.5 final build", date: "April 26, 2021" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "iPadOS 14.5.1", date: "May 3, 2021" }
                            ]
                        },
                        "14-6": {
                            label: "iPadOS 14.6",
                            releases: [
                                { name: "iPadOS 14.6 beta 1", date: "April 22, 2021", alignment: "left" },
                                { name: "iPadOS 14.6 beta 2", date: "April 30, 2021", alignment: "right" },
                                { name: "iPadOS 14.6 beta 3", date: "May 10, 2021", spanTwo: true },
                                {
                                    pair: [
                                        { name: "iPadOS 14.6 RC build", date: "May 17, 2021", note: "build 2: May 21, 2021" },
                                        { name: "iPadOS 14.6 final build", date: "May 24, 2021" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "14-7": {
                            label: "iPadOS 14.7",
                            releases: [
                                { name: "iPadOS 14.7 beta 1", date: "May 19, 2021", alignment: "left" },
                                { name: "iPadOS 14.7 beta 2", date: "June 2, 2021", alignment: "right" },
                                { name: "iPadOS 14.7 beta 3", date: "June 14, 2021", alignment: "left" },
                                { name: "iPadOS 14.7 beta 4", date: "June 29, 2021", alignment: "right" },
                                { name: "iPadOS 14.7 beta 5", date: "July 8, 2021", spanTwo: true },
                                {
                                    pair: [
                                        { name: "iPadOS 14.7 RC build", date: "July 13, 2021" },
                                        { name: "iPadOS 14.7 final build", date: "July 19, 2021" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "iPadOS 14.7.1", date: "July 26, 2021" }
                            ]
                        },
                        "14-8-x": {
                            label: "iPadOS 14.8.x",
                            releases: [
                                {
                                    pair: [
                                        { name: "iPadOS 14.8", date: "September 13, 2021" },
                                        { name: "iPadOS 14.8.1", date: "October 26, 2021" }
                                    ],
                                    className: "release-pair-builds"
                                },
                            ]
                        },
                    };
            initializeTimelinePage(timelines);
        },
        "ipados-15.html": () => {
            const timelines = {
                        "15-0": {
                            label: "iPadOS 15.0",
                            releases: [
                                { name: "iPadOS 15.0 beta 1", date: "June 7, 2021", alignment: "left" },
                                { name: "iPadOS 15.0 beta 2", date: "June 24, 2021", note: "build 2: June 30, 2021", alignment: "right" },
                                { name: "iPadOS 15.0 beta 3", date: "July 14, 2021", alignment: "left" },
                                { name: "iPadOS 15.0 beta 4", date: "July 27, 2021", alignment: "right" },
                                { name: "iPadOS 15.0 beta 5", date: "August 10, 2021", alignment: "left" },
                                { name: "iPadOS 15.0 beta 6", date: "August 17, 2021", alignment: "right" },
                                { name: "iPadOS 15.0 beta 7", date: "August 25, 2021", alignment: "left" },
                                { name: "iPadOS 15.0 beta 8", date: "August 31, 2021", alignment: "right" },
                                {
                                    pair: [
                                        { name: "iPadOS 15.0 RC build", date: "September 14, 2021" },
                                        { name: "iPadOS 15.0 final build", date: "September 20, 2021" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                {
                                    pair: [
                                        { name: "iPadOS 15.0.1", date: "October 1, 2021" },
                                        { name: "iPadOS 15.0.2", date: "October 11, 2021" }
                                    ],
                                    className: "release-pair-tight"
                                }
                            ]
                        },
                        "15-1": {
                            label: "iPadOS 15.1",
                            releases: [
                                { name: "iPadOS 15.1 beta 1", date: "September 21, 2021", alignment: "left" },
                                { name: "iPadOS 15.1 beta 2", date: "September 28, 2021", alignment: "right" },
                                { name: "iPadOS 15.1 beta 3", date: "October 6, 2021", alignment: "left" },
                                { name: "iPadOS 15.1 beta 4", date: "October 13, 2021", alignment: "right" },
                                {
                                    pair: [
                                        { name: "iPadOS 15.1 RC build", date: "October 18, 2021" },
                                        { name: "iPadOS 15.1 final build", date: "October 25, 2021" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "iOS 15.1.1", date: "November 17, 2021" }
                            ]
                        },
                        "15-2": {
                            label: "iPadOS 15.2",
                            releases: [
                                { name: "iPadOS 15.2 beta 1", date: "October 27, 2021", alignment: "left" },
                                { name: "iPadOS 15.2 beta 2", date: "November 9, 2021", alignment: "right" },
                                { name: "iPadOS 15.2 beta 3", date: "November 16, 2021", alignment: "left" },
                                { name: "iPadOS 15.2 beta 4", date: "December 2, 2021", alignment: "right" },
                                {
                                    pair: [
                                        { name: "iPadOS 15.2 RC build", date: "December 7, 2021", note: "build 2: December 10, 2021" },
                                        { name: "iPadOS 15.2 final build", date: "December 13, 2021" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "iPadOS 15.2.1", date: "January 12, 2022" }
                            ]
                        },
                        "15-3": {
                            label: "iPadOS 15.3",
                            releases: [
                                { name: "iPadOS 15.3 beta 1", date: "December 17, 2021", alignment: "left" },
                                { name: "iPadOS 15.3 beta 2", date: "January 12, 2022", alignment: "right" },
                                {
                                    pair: [
                                        { name: "iPadOS 15.3 RC build", date: "January 20, 2022" },
                                        { name: "iPadOS 15.3 final build", date: "January 26, 2022" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "iPadOS 15.3.1", date: "February 10, 2022" }
                            ]
                        },
                        "15-4": {
                            label: "iPadOS 15.4",
                            releases: [
                                { name: "iPadOS 15.4 beta 1", date: "January 27, 2022", alignment: "left" },
                                { name: "iPadOS 15.4 beta 2", date: "February 8, 2022", alignment: "right" },
                                { name: "iPadOS 15.4 beta 3", date: "February 15, 2022", alignment: "left" },
                                { name: "iPadOS 15.4 beta 4", date: "February 22, 2022", alignment: "right" },
                                { name: "iPadOS 15.4 beta 5", date: "March 1, 2022", spanTwo: true },
                                {
                                    pair: [
                                        { name: "iPadOS 15.4 RC build", date: "March 8, 2022" },
                                        { name: "iPadOS 15.4 final build", date: "March 14, 2022" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "iPadOS 15.4.1", date: "March 31, 2022" }
                            ]
                        },
                        "15-5": {
                            label: "iPadOS 15.5",
                            releases: [
                                { name: "iPadOS 15.5 beta 1", date: "April 5, 2022", alignment: "left" },
                                { name: "iPadOS 15.5 beta 2", date: "April 19, 2022", alignment: "right" },
                                { name: "iPadOS 15.5 beta 3", date: "April 26, 2022", alignment: "left" },
                                { name: "iPadOS 15.5 beta 4", date: "May 3, 2022", alignment: "right" },
                                {
                                    pair: [
                                        { name: "iPadOS 15.5 RC build", date: "May 12, 2022" },
                                        { name: "iPadOS 15.5 final build", date: "May 16, 2022" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "15-6": {
                            label: "iPadOS 15.6",
                            releases: [
                                { name: "iPadOS 15.6 beta 1", date: "May 18, 2022", alignment: "left" },
                                { name: "iPadOS 15.6 beta 2", date: "May 31, 2022", alignment: "right" },
                                { name: "iPadOS 15.6 beta 3", date: "June 14, 2022", alignment: "left" },
                                { name: "iPadOS 15.6 beta 4", date: "June 28, 2022", alignment: "right" },
                                { name: "iPadOS 15.6 beta 5", date: "July 5, 2022", spanTwo: true },
                                {
                                    pair: [
                                        { name: "iOS 15.6 RC build", date: "July 12, 2022", note: "build 2: July 15, 2022" },
                                        { name: "iOS 15.6 final build", date: "July 20, 2022" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "iPadOS 15.6.1", date: "August 17, 2022" }
                            ]
                        },
                        "15-7-x": {
                            label: "iPadOS 15.7.x",
                            releases: [
                                {
                                    trio: [
                                        { date: "iPadOS 15.7", note: "RC build: Sep 7, 2022\nFinal build: Sep 12, 2022" },
                                        { date: "iPadOS 15.7.1", note: "RC build: Oct 18, 2022\nFinal build: Oct 27, 2022" },
                                        { date: "iPadOS 15.7.2", note: "RC build: Dec 7, 2022\nFinal build: Dec 13, 2022"}
                                    ],
                                    className: "release-pair-compact"
                                },
                                {
                                    trio: [
                                        { date: "iPadOS 15.7.3", note: "RC build: Jan 18, 2023\nFinal build: Jan 23, 2023" },
                                        { date: "iPadOS 15.7.4", note: "RC build: Mar 21, 2023\nFinal build: Mar 27, 2023" },
                                        { date: "iPadOS 15.7.5", note: "Final build: Apr 10, 2023"}
                                    ],
                                    className: "release-pair-compact"
                                },
                                {
                                    trio: [
                                        { date: "iPadOS 15.7.6", note: "RC build: May 9, 2023\nFinal build: May 18, 2023" },
                                        { date: "iPadOS 15.7.7", note: "Final build: Jun 21, 2023" },
                                        { date: "iPadOS 15.7.8", note: "RC build: Jul 18, 2023\nFinal build: Jul 24, 2023"}
                                    ],
                                    className: "release-pair-compact"
                                },
                            ]
                        },
                        "15-8-x": {
                            label: "iPadOS 15.8.x",
                            releases: [
                                {
                                    trio: [
                                        { date: "iPadOS 15.8", note: "RC build: Oct 17, 2023\nFinal build: Oct 25, 2023" },
                                        { date: "iPadOS 15.8.1", note: "RC build: Jan 17, 2024\nFinal build: Jan 22, 2024" },
                                        { date: "iPadOS 15.8.2", note: "RC build: Feb 27, 2024\nFinal build: Mar 5, 2024"}
                                    ],
                                    className: "release-pair-compact"
                                },
                                {
                                    trio: [
                                        { date: "iPadOS 15.8.3", note: "RC build: Jul 23, 2024\nFinal build: Jul 29, 2024" },
                                        { date: "iPadOS 15.8.4", note: "Final build: Mar 31, 2025" },
                                        { date: "iPadOS 15.8.5", note: "RC build: Sep 9, 2025\nFinal build: Sep 15, 2025"}
                                    ],
                                    className: "release-pair-compact"
                                },
                                {
                                    trio: [
                                        { date: "iPadOS 15.8.6", note: "Final build: Jan 26, 2026" },
                                        { date: "iPadOS 15.8.7", note: "Final build: Mar 11, 2026" },
                                        { date: "iPadOS 15.8.8", note: "Final build: May 11, 2026"}
                                    ],
                                    className: "release-pair-compact"
                                },
                            ]
                        },
                    };
            initializeTimelinePage(timelines);
        },
        "ipados-16.html": () => {
            const timelines = {
                        "16-0": {
                            label: "iPadOS 16.0",
                            intro: "iPadOS 16 released as iPadOS 16.1 on Oct 24, 2022. See 'iPadOS 16.1' for more.",
                            releases: [
                                { name: "iPadOS 16.0 beta 1", date: "June 6, 2022", alignment: "left" },
                                { name: "iPadOS 16.0 beta 2", date: "June 22, 2022", alignment: "right" },
                                { name: "iPadOS 16.0 beta 3", date: "July 6, 2022", note: "build 2: July 11, 2022", alignment: "left" },
                                { name: "iPadOS 16.0 beta 4", date: "July 27, 2022", alignment: "right" },
                                { name: "iPadOS 16.0 beta 5", date: "August 8, 2022", alignment: "left" },
                                { name: "iPadOS 16.0 beta 6", date: "August 15, 2022", alignment: "right" },
                            ],
                        },
                        "16-1": {
                            label: "iPadOS 16.1",
                            supplementalIntro: "iPadOS 16 released as iPadOS 16.1.",
                            releases: [
                                { name: "iPadOS 16.1 beta 1", date: "August 23, 2022", alignment: "left" },
                                { name: "iPadOS 16.1 beta 2", date: "September 14, 2022", alignment: "right" },
                                { name: "iPadOS 16.1 beta 3", date: "September 20, 2022", alignment: "left" },
                                { name: "iPadOS 16.1 beta 4", date: "September 27, 2022", alignment: "right" },
                                { name: "iPadOS 16.1 beta 5", date: "October 4, 2022", alignment: "left" },
                                { name: "iPadOS 16.1 beta 6", date: "October 11, 2022", alignment: "right" },
                                {
                                    pair: [
                                        { name: "iPadOS 16.1 RC build", date: "October 18, 2022" },
                                        { name: "iPadOS 16.1 final build", date: "October 24, 2022" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "iPadOS 16.1.1", date: "November 9, 2022" }
                            ]
                        },
                        "16-2": {
                            label: "iPadOS 16.2",
                            releases: [
                                { name: "iPadOS 16.2 beta 1", date: "October 25, 2022", alignment: "left" },
                                { name: "iPadOS 16.2 beta 2", date: "November 8, 2022", alignment: "right" },
                                { name: "iPadOS 16.2 beta 3", date: "November 15, 2022", alignment: "left" },
                                { name: "iPadOS 16.2 beta 4", date: "December 1, 2022", alignment: "right" },
                                {
                                    pair: [
                                        { name: "iPadOS 16.2 RC build", date: "December 7, 2022" },
                                        { name: "iPadOS 16.2 final build", date: "December 13, 2022" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "16-3": {
                            label: "iPadOS 16.3",
                            releases: [
                                { name: "iPadOS 16.3 beta 1", date: "December 14, 2022", alignment: "left" },
                                { name: "iPadOS 16.3 beta 2", date: "January 10, 2023", alignment: "right" },
                                {
                                    pair: [
                                        { name: "iPadOS 16.3 RC build", date: "January 18, 2023" },
                                        { name: "iPadOS 16.3 final build", date: "January 23, 2023" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "iPadOS 16.3.1", date: "February 13, 2023" }
                            ]
                        },
                        "16-4": {
                            label: "iPadOS 16.4",
                            releases: [
                                { name: "iPadOS 16.4 beta 1", date: "February 16, 2023", alignment: "left" },
                                { name: "iPadOS 16.4 beta 2", date: "February 28, 2023", alignment: "right" },
                                { name: "iPadOS 16.4 beta 3", date: "March 7, 2023", alignment: "left" },
                                { name: "iPadOS 16.4 beta 4", date: "March 15, 2023", alignment: "right" },
                                {
                                    pair: [
                                        { name: "iPadOS 16.4 RC build", date: "March 21, 2023" },
                                        { name: "iPadOS 16.4 final build", date: "March 27, 2023" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "iPadOS 16.4.1", date: "April 7, 2023" }
                            ]
                        },
                        "16-5": {
                            label: "iPadOS 16.5",
                            releases: [
                                { name: "iPadOS 16.5 beta 1", date: "March 28, 2023", alignment: "left" },
                                { name: "iPadOS 16.5 beta 2", date: "April 11, 2023", alignment: "right" },
                                { name: "iPadOS 16.5 beta 3", date: "April 25, 2023", alignment: "left" },
                                { name: "iPadOS 16.5 beta 4", date: "May 2, 2023", alignment: "right" },
                                {
                                    pair: [
                                        { name: "iPadOS 16.5 RC build", date: "May 9, 2023", note: "build 2: May 15, 2023" },
                                        { name: "iPadOS 16.5 final build", date: "May 18, 2023" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name : "iPadOS 16.5.1", date: "June 21, 2023" }
                            ]
                        },
                        "16-6": {
                            label: "iOS 16.6",
                            releases: [
                                { name: "iPadOS 16.6 beta 1", date: "May 19, 2023", alignment: "left" },
                                { name: "iPadOS 16.6 beta 2", date: "May 31, 2023", alignment: "right" },
                                { name: "iPadOS 16.6 beta 3", date: "June 15, 2023", alignment: "left" },
                                { name: "iPadOS 16.6 beta 4", date: "June 27, 2023", alignment: "right" },
                                { name: "iPadOS 16.6 beta 5", date: "July 10, 2023", spanTwo: true },
                                {
                                    pair: [
                                        { name: "iPadOS 16.6 RC build", date: "July 18, 2023" },
                                        { name: "iPadOS 16.6 final build", date: "July 24, 2023" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "iPadOS 16.6.1", date: "September 7, 2023" }
                            ]
                        },
                        "16-7-x": {
                            label: "iPadOS 16.7.x",
                            releases: [
                                {
                                    trio: [
                                        { date: "iPadOS 16.7", note: "RC build: Sep 12, 2023\nFinal build: Sep 21, 2023" },
                                        { date: "iPadOS 16.7.1", note: "Final build: Oct 10, 2023" },
                                        { date: "iPadOS 16.7.2", note: "RC build: Oct 17, 2023\nFinal build: Oct 25, 2023"}
                                    ],
                                    className: "release-pair-compact"
                                },
                                {
                                    trio: [
                                        { date: "iPadOS 16.7.3", note: "RC build: Dec 5, 2023\nFinal build: Dec 11, 2023" },
                                        { date: "iPadOS 16.7.4", note: "Final build: Dec 19, 2023" },
                                        { date: "iPadOS 16.7.5", note: "RC build: Jan 17, 2024\nFinal build: Jan 22, 2024"}
                                    ],
                                    className: "release-pair-compact"
                                },
                                {
                                    trio: [
                                        { date: "iPadOS 16.7.6", note: "RC build: Feb 27, 2024\nFinal build: Mar 5, 2024" },
                                        { date: "iPadOS 16.7.7", note: "Final build: Mar 21, 2024" },
                                        { date: "iPadOS 16.7.8", note: "RC build: May 7, 2024\nFinal build: May 13, 2024"}
                                    ],
                                    className: "release-pair-compact"
                                },
                                {
                                    trio: [
                                        { date: "iPadOS 16.7.9", note: "RC build: Jul 23, 2024\nFinal build: Jul 29, 2024" },
                                        { date: "iPadOS 16.7.10", note: "Final build: Aug 7, 2024" },
                                        { date: "iPadOS 16.7.11", note: "Final build: Mar 31, 2025"}
                                    ],
                                    className: "release-pair-compact"
                                },
                                {
                                    trio: [
                                        { date: "iPadOS 16.7.12", note: "RC build: Sep 9, 2025\nFinal build: Sep 15, 2025" },
                                        { date: "iPadOS 16.7.13", note: "Final build: Jan 26, 2026" },
                                        { date: "iPadOS 16.7.14", note: "Final build: Feb 2, 2026"}
                                    ],
                                    className: "release-pair-compact"
                                },
                                {
                                    pair: [
                                        { date: "iPadOS 16.7.15", note: "Final build: Mar 11, 2026" },
                                        { date: "iPadOS 16.7.16", note: "Final build: May 11, 2026" }
                                    ],
                                    className: "release-pair-compact"
                                },
                            ]
                        }
                    };
            initializeTimelinePage(timelines);
        },
        "ipados-17.html": () => {
            const timelines = {
                        "17-0": {
                            label: "iOS 17.0",
                            releases: [
                                { name: "iPadOS 17.0 beta 1", date: "June 5, 2023", alignment: "left" },
                                { name: "iPadOS 17.0 beta 2", date: "June 21, 2023", alignment: "right" },
                                { name: "iPadOS 17.0 beta 3", date: "July 5, 2023", note: "build 2: July 11, 2023", alignment: "left" },
                                { name: "iPadOS 17.0 beta 4", date: "July 25, 2023", note: "build 2: July 31, 2023", alignment: "right" },
                                { name: "iPadOS 17.0 beta 5", date: "August 8, 2023", alignment: "left" },
                                { name: "iPadOS 17.0 beta 6", date: "August 15, 2023", alignment: "right" },
                                { name: "iPadOS 17.0 beta 7", date: "August 22, 2023", alignment: "left" },
                                { name: "iPadOS 17.0 beta 8", date: "August 29, 2023", alignment: "right" },
                                {
                                    pair: [
                                        { name: "iPadOS 17.0 RC build", date: "September 12, 2023" },
                                        { name: "iPadOS 17.0 final build", date: "September 18, 2023" }
                                    ],
                                    className: "release-trio-tight"
                                }
                            ],
                            supplemental: [
                                {
                                    trio: [
                                        { name: "iPadOS 17.0.1", date: "September 21, 2023" },
                                        { name: "iPadOS 17.0.2", date: "September 26, 2023" },
                                        { name: "iPadOS 17.0.3", date: "October 4, 2023" }
                                    ]
                                }
                            ]
                        },
                        "17-1": {
                            label: "iPadOS 17.1",
                            releases: [
                                { name: "iPadOS 17.1 beta 1", date: "September 27, 2023", alignment: "left" },
                                { name: "iPadOS 17.1 beta 2", date: "October 3, 2023", alignment: "right" },
                                { name: "iPadOS 17.1 beta 3", date: "October 10, 2023", spanTwo: true },
                                {
                                    pair: [
                                        { name: "iPadOS 17.1 RC build", date: "October 17, 2023" },
                                        { name: "iPadOS 17.1 final build", date: "October 25, 2023" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                {
                                    pair: [
                                        { name: "iPadOS 17.1.1", date: "November 7, 2023" },
                                        { name: "iPadOS 17.1.2", date: "November 30, 2023" },
                                    ],
                                    className: "release-pair-tight"
                                }
                            ]
                        },
                        "17-2": {
                            label: "iPadOS 17.2",
                            releases: [
                                { name: "iPadOS 17.2 beta 1", date: "October 26, 2023", alignment: "left" },
                                { name: "iPadOS 17.2 beta 2", date: "November 9, 2023", alignment: "right" },
                                { name: "iPadOS 17.2 beta 3", date: "November 14, 2023", alignment: "left" },
                                { name: "iPadOS 17.2 beta 4", date: "November 28, 2023", alignment: "right" },
                                {
                                    pair: [
                                        { name: "iPadOS 17.2 RC build", date: "December 5, 2023" },
                                        { name: "iPadOS 17.2 final build", date: "December 11, 2023" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "iPadOS 17.2.1", date: "December 19, 2023" }
                            ]
                        },
                        "17-3": {
                            label: "iPadOS 17.3",
                            releases: [
                                { name: "iPadOS 17.3 beta 1", date: "December 12, 2023", alignment: "left" },
                                { name: "iPadOS 17.3 beta 2", date: "January 3, 2024", alignment: "right" },
                                { name: "iPadOS 17.3 beta 3", date: "January 9, 2024", spanTwo: true },
                                {
                                    pair: [
                                        { name: "iPadOS 17.3 RC build", date: "January 17, 2024" },
                                        { name: "iPadOS 17.3 final build", date: "January 22, 2024" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "iPadOS 17.3.1", date: "February 8, 2024" },
                            ]
                        },
                        "17-4": {
                            label: "iPadOS 17.4",
                            releases: [
                                { name: "iPadOS 17.4 beta 1", date: "January 25, 2024", alignment: "left" },
                                { name: "iPadOS 17.4 beta 2", date: "February 6, 2024", alignment: "right" },
                                { name: "iPadOS 17.4 beta 3", date: "February 13, 2024", alignment: "left" },
                                { name: "iPadOS 17.4 beta 4", date: "February 20, 2024", alignment: "right" },
                                {
                                    pair: [
                                        { name: "iPadOS 17.4 RC build", date: "February 27, 2024" },
                                        { name: "iPadOS 17.4 final build", date: "March 5, 2024" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "iPadOS 17.4.1", date: "March 21, 2024", note: "build 2: March 26, 2024"}
                            ]
                        },
                        "17-5": {
                            label: "iPadOS 17.5",
                            releases: [
                                { name: "iPadOS 17.5 beta 1", date: "April 2, 2024", alignment: "left" },
                                { name: "iPadOS 17.5 beta 2", date: "April 16, 2024", alignment: "right" },
                                { name: "iPadOS 17.5 beta 3", date: "April 23, 2024", alignment: "left" },
                                { name: "iPadOS 17.5 beta 4", date: "April 30, 2024", alignment: "right" },
                                {
                                    pair: [
                                        { name: "iPadOS 17.5 RC build", date: "May 7, 2024" },
                                        { name: "iPadOS 17.5 final build", date: "May 13, 2024" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "iPadOS 17.5.1", date: "May 20, 2024" }
                            ]
                        },
                        "17-6": {
                            label: "iPadOS 17.6",
                            releases: [
                                { name: "iPadOS 17.6 beta 1", date: "June 17, 2024", alignment: "left" },
                                { name: "iPadOS 17.6 beta 2", date: "July 1, 2024", alignment: "right" },
                                { name: "iPadOS 17.6 beta 3", date: "July 9, 2024", alignment: "left" },
                                { name: "iPadOS 17.6 beta 4", date: "July 16, 2024", alignment: "right"},
                                {
                                    pair: [
                                        { name: "iPadOS 17.6 RC build", date: "July 23, 2024" },
                                        { name: "iPadOS 17.6 final build", date: "July 29, 2024" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "iPadOS 17.6.1", date: "August 7, 2024", note: "build 2: August 19, 2024" },
                            ]
                        },
                        "17-7-x": {
                            label: "iOS 17.7.x",
                            releases: [
                                {
                                    trio: [
                                        { date: "iPadOS 17.7", note: "RC build: Sep 9, 2024\nFinal build: Sep 16, 2024" },
                                        { date: "iPadOS 17.7.1", note: "RC build: Oct 21, 2024\nFinal build: Oct 28, 2024" },
                                        { date: "iPadOS 17.7.2", note: "Final build: Nov 19, 2024" },
                                    ],
                                    className: "release-trio-tight"
                                },
                                {
                                    trio: [
                                        { date: "iPadOS 17.7.3", note: "RC build: Dec 5, 2024\nFinal build: Dec 11, 2024" },
                                        { date: "iPadOS 17.7.4", note: "RC build: Jan 21, 2025\nFinal build: Jan 27, 2025" },
                                        { date: "iPadOS 17.7.5", note: "Final build: Feb 10, 2025" },
                                    ],
                                    className: "release-trio-tight"
                                },
                                {
                                    trio: [
                                        { date: "iPadOS 17.7.6", note: "RC build: Mar 24, 2025\nFinal build: Mar 31, 2025" },
                                        { date: "iPadOS 17.7.7", note: "RC build: May 6, 2025\nFinal build: May 12, 2025" },
                                        { date: "iPadOS 17.7.8", note: "Final build: May 19, 2025" },
                                    ],
                                    className: "release-trio-tight"
                                },
                                {
                                    trio: [
                                        { date: "iPadOS 17.7.9", note: "RC build: Jul 21, 2025\nFinal build: Jul 29, 2025" },
                                        { date: "iPadOS 17.7.10", note: "Final build: Aug 20, 2025" },
                                        { date: "iPadOS 17.7.11", note: "Final build: May 11, 2026" },
                                    ],
                                    className: "release-trio-tight"
                                },
                            ]
                        }
                    };
            initializeTimelinePage(timelines);
        },
        "ipados-18.html": () => {
            const timelines = {
                        "18-0": {
                            label: "iPadOS 18.0",
                            releases: [
                                { name: "iPadOS 18.0 beta 1", date: "June 10, 2024", alignment: "left" },
                                { name: "iPadOS 18.0 beta 2", date: "June 24, 2024", alignment: "right" },
                                { name: "iPadOS 18.0 beta 3", date: "July 8, 2024", note: "build 2: July 15, 2024", alignment: "left" },
                                { name: "iPadOS 18.0 beta 4", date: "July 23, 2024", note: "build 2: July 26, 2024", alignment: "right" },
                                { name: "iPadOS 18.0 beta 5", date: "August 5, 2024", alignment: "left" },
                                { name: "iPadOS 18.0 beta 6", date: "August 12, 2024", alignment: "right" },
                                { name: "iPadOS 18.0 beta 7", date: "August 20, 2024", alignment: "left" },
                                { name: "iPadOS 18.0 beta 8", date: "August 28, 2024", alignment: "right" },
                                {
                                    pair: [
                                        { name: "iPadOS 18.0 RC build", date: "September 9, 2024" },
                                        { name: "iPadOS 18.0 final build", date: "September 16, 2024" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "iPadOS 18.0.1", date: "October 3, 2024" }
                            ]
                        },
                        "18-1": {
                            label: "iPadOS 18.1",
                            releases: [
                                { name: "iPadOS 18.1 beta 1", date: "July 29, 2024", alignment: "left" },
                                { name: "iPadOS 18.1 beta 2", date: "August 12, 2024", alignment: "right" },
                                { name: "iPadOS 18.1 beta 3", date: "August 28, 2024", alignment: "left" },
                                { name: "iPadOS 18.1 beta 4", date: "September 17, 2024", alignment: "right" },
                                { name: "iPadOS 18.1 beta 5", date: "September 23, 2024", alignment: "left" },
                                { name: "iPadOS 18.1 beta 6", date: "October 7, 2024", alignment: "right" },
                                { name: "iPadOS 18.1 beta 7", date: "October 14, 2024", spanTwo: true },
                                {
                                    pair: [
                                        { name: "iPadOS 18.1 RC build", date: "October 21, 2024" },
                                        { name: "iPadOS 18.1 final build", date: "October 28, 2024" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "iPadOS 18.1.1", date: "November 19, 2024" }
                            ]
                        },
                        "18-2": {
                            label: "iPadOS 18.2",
                            releases: [
                                { name: "iPadOS 18.2 beta 1", date: "October 23, 2024", alignment: "left" },
                                { name: "iPadOS 18.2 beta 2", date: "November 4, 2024", alignment: "right" },
                                { name: "iPadOS 18.2 beta 3", date: "November 11, 2024", alignment: "left" },
                                { name: "iPadOS 18.2 beta 4", date: "November 20, 2024", alignment: "right" },
                                {
                                    pair: [
                                        { name: "iPadOS 18.2 RC build", date: "December 5, 2024", note: "build 2: December 9, 2024" },
                                        { name: "iPadOS 18.2 final build", date: "December 11, 2024" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "iPadOS 18.2.1", date: "January 6, 2025" }
                            ]
                        },
                        "18-3": {
                            label: "iPadOS 18.3",
                            releases: [
                                { name: "iPadOS 18.3 beta 1", date: "December 16, 2024", alignment: "left" },
                                { name: "iPadOS 18.3 beta 2", date: "January 7, 2025", alignment: "right" },
                                { name: "iPadOS 18.3 beta 3", date: "January 16, 2025", spanTwo: true },
                                {
                                    pair: [
                                        { name: "iPadOS 18.3 RC build", date: "January 21, 2025" },
                                        { name: "iPadOS 18.3 final build", date: "January 27, 2025" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                {
                                    pair: [
                                        { name: "iPadOS 18.3.1", date: "February 10, 2025" },
                                        { name: "iPadOS 18.3.2", date: "March 11, 2025" },
                                    ],
                                    className: "release-pair-tight"
                                }
                            ]
                        },
                        "18-4": {
                            label: "iPadOS 18.4",
                            releases: [
                                { name: "iPadOS 18.4 beta 1", date: "February 21, 2025", alignment: "left" },
                                { name: "iPadOS 18.4 beta 2", date: "March 3, 2025", alignment: "right" },
                                { name: "iPadOS 18.4 beta 3", date: "March 10, 2025", alignment: "left" },
                                { name: "iPadOS 18.4 beta 4", date: "March 17, 2025", alignment: "right" },
                                {
                                    pair: [
                                        { name: "iPadOS 18.4 RC build", date: "March 24, 2025", note: "build 2: March 28, 2025" },
                                        { name: "iPadOS 18.4 final build", date: "March 31, 2025" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "iPadOS 18.4.1", date: "April 16, 2025" }
                            ]
                        },
                        "18-5": {
                            label: "iPadOS 18.5",
                            releases: [
                                { name: "iPadOS 18.5 beta 1", date: "April 2, 2025", alignment: "left" },
                                { name: "iPadOS 18.5 beta 2", date: "April 14, 2025", alignment: "right" },
                                { name: "iPadOS 18.5 beta 3", date: "April 21, 2025", alignment: "left" },
                                { name: "iPadOS 18.5 beta 4", date: "April 28, 2025", alignment: "right" },
                                {
                                    pair: [
                                        { name: "iPadOS 18.5 RC build", date: "May 6, 2025" },
                                        { name: "iPadOS 18.5 final build", date: "May 12, 2025" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ]
                        },
                        "18-6": {
                            label: "iPadOS 18.6",
                            releases: [
                                { name: "iPadOS 18.6 beta 1", date: "June 16, 2025", alignment: "left" },
                                { name: "iPadOS 18.6 beta 2", date: "June 30, 2025", alignment: "right" },
                                { name: "iPadOS 18.6 beta 3", date: "July 14, 2025", spanTwo: true },
                                {
                                    pair: [
                                        { name: "iPadOS 18.6 RC build", date: "July 21, 2025" },
                                        { name: "iPadOS 18.6 final build", date: "July 29, 2025" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                {
                                    pair: [
                                        { name: "iPadOS 18.6.1", date: "August 14, 2025" },
                                        { name: "iPadOS 18.6.2", date: "August 20, 2025" },
                                    ],
                                    className: "release-pair-tight"
                                }
                            ]
                        },
                        "18-7-x": {
                            label: "iPadOS 18.7.x",
                            releases: [
                                {
                                    quad: [
                                        { date: "iPadOS 18.7", note: "RC build: Sep 9, 2025\nFinal build: Sep 15, 2025" },
                                        { date: "iPadOS 18.7.1", note: "Final build: Sep 29, 2025" },
                                        { date: "iPadOS 18.7.2", note: "RC build: Oct 28, 2025\nFinal build: Nov 5, 2025" },
                                        { date: "iPadOS 18.7.3", note: "RC build: Dec 3, 2025\nFinal build: Dec 12, 2025" },                            
                                    ],
                                    className: "release-quad-tight"
                                },
                                {
                                    quad: [
                                        { date: "iPadOS 18.7.4", note: "Final build: Jan 26, 2026" },
                                        { date: "iPadOS 18.7.5", note: "RC build: Feb 4, 2026\nFinal build: Feb 11, 2026" },
                                        { date: "iPadOS 18.7.6", note: "Final build: Mar 4, 2026" },
                                        { date: "iPadOS 18.7.7", note: "RC build: Mar 18, 2026\nFinal build: Mar 24, 2026" },                            
                                    ],
                                    className: "release-quad-tight"
                                },
                                {
                                    trio: [
                                        { date: "iPadOS 18.7.8", note: "Final build: Apr 22, 2026" },
                                        { date: "iPadOS 18.7.9", note: "RC build: May 4, 2026\nFinal build: May 11, 2026" },
                                        { date: "iPadOS 18.7.10", note: "RC build: Aug 10, 2026\nFinal build: Aug 17, 2026" },                      
                                    ],
                                    className: "release-trio-tight"
                                },
                                {
                                    pair: [
                                        { date: "iPadOS 18.7.11", note: "Final build: Oct 26, 2026" },
                                        { date: "iPadOS 18.7.12", note: "Final build: Nov 9, 2026" },
                                    ],
                                    className: "release-pair-tight"
                                },
                            ]
                        }
                    };
            initializeTimelinePage(timelines);
        },
        "ipados-26.html": () => {
            const timelines = {
                        "26-0": {
                            label: "iPadOS 26.0",
                            releases: [
                                { name: "iPadOS 26.0 beta 1", date: "Jun 9, 2025" },
                                { name: "iPadOS 26.0 beta 2", date: "Jun 23, 2025" },
                                { name: "iPadOS 26.0 beta 3", date: "Jul 7, 2025" },
                                { name: "iPadOS 26.0 beta 4", date: "Jul 22, 2025", note: "build 2: Jul 24, 2025" },
                                { name: "iPadOS 26.0 beta 5", date: "Aug 5, 2025" },
                                { name: "iPadOS 26.0 beta 6", date: "Aug 11, 2025", note: "build 2: Aug 14, 2025" },
                                { name: "iPadOS 26.0 beta 7", date: "Aug 18, 2025" },
                                { name: "iPadOS 26.0 beta 8", date: "Aug 25, 2025" },
                                { name: "iPadOS 26.0 beta 9", date: "Sep 2, 2025", spanTwo: true },
                                {
                                    pair: [
                                        { name: "iPadOS 26.0 RC build", date: "Sep 9, 2025" },
                                        { name: "iPadOS 26.0 final build", date: "Sep 15, 2025" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "iPadOS 26.0.1", date: "Sep 29, 2025" }
                            ]
                        },
                        "26-1": {
                            label: "iPadOS 26.1",
                            releases: [
                                { name: "iPadOS 26.1 beta 1", date: "Sep 22, 2025" },
                                { name: "iPadOS 26.1 beta 2", date: "Oct 6, 2025" },
                                { name: "iPadOS 26.1 beta 3", date: "Oct 13, 2025" },
                                { name: "iPadOS 26.1 beta 4", date: "Oct 20, 2025" },
                                {
                                    pair: [
                                        { name: "iPadOS 26.1 RC build", date: "Oct 28, 2025" },
                                        { name: "iPadOS 26.1 final build", date: "Nov 3, 2025" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ]
                        },
                        "26-2": {
                            label: "iPadOS 26.2",
                            releases: [
                                { name: "iPadOS 26.2 beta 1", date: "Nov 4, 2025" },
                                { name: "iPadOS 26.2 beta 2", date: "Nov 12, 2025" },
                                { name: "iPadOS 26.2 beta 3", date: "Nov 17, 2025", spanTwo: true },
                                {
                                    pair: [
                                        { name: "iPadOS 26.2 RC build", date: "Dec 3, 2025" },
                                        { name: "iPadOS 26.2 final build", date: "Dec 12, 2025" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "iPadOS 26.2.1", date: "Jan 26, 2026" }
                            ]
                        },
                        "26-3": {
                            label: "iPadOS 26.3",
                            releases: [
                                { name: "iPadOS 26.3 beta 1", date: "Dec 15, 2025" },
                                { name: "iPadOS 26.3 beta 2", date: "Jan 12, 2026" },
                                { name: "iPadOS 26.3 beta 3", date: "Jan 26, 2026", spanTwo: true },
                                {
                                    pair: [
                                        { name: "iPadOS 26.3 RC build", date: "Feb 4, 2026" },
                                        { name: "iPadOS 26.3 final build", date: "Feb 11, 2026" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "iPadOS 26.3.1", date: "Mar 4, 2026" }
                            ]
                        },
                        "26-4": {
                            label: "iPadOS 26.4",
                            releases: [
                                { name: "iPadOS 26.4 beta 1", date: "Feb 16, 2026" },
                                { name: "iPadOS 26.4 beta 2", date: "Feb 23, 2026" },
                                { name: "iPadOS 26.4 beta 3", date: "Mar 2, 2026", note: "build 2: Mar 5, 2026" },
                                { name: "iPadOS 26.4 beta 4", date: "Mar 9, 2026" },
                                {
                                    pair: [
                                        { name: "iPadOS 26.4 RC build", date: "Mar 18, 2026" },
                                        { name: "iPadOS 26.4 final build", date: "Mar 24, 2026" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                {
                                    pair: [
                                        { name: "iPadOS 26.4.1", date: "Apr 8, 2026" },
                                        { name: "iPadOS 26.4.2", date: "Apr 22, 2026" }
                                    ],
                                    className: "release-pair-tight"
                                }
                            ]
                        },
                        "26-5": {
                            label: "iPadOS 26.5",
                            releases: [
                                { name: "iPadOS 26.5 beta 1", date: "Mar 30, 2026", note: "build 2: Apr 3, 2026" },
                                { name: "iPadOS 26.5 beta 2", date: "Apr 13, 2026" },
                                { name: "iPadOS 26.5 beta 3", date: "Apr 20, 2026" },
                                { name: "iPadOS 26.5 beta 4", date: "Apr 27, 2026" },
                                {
                                    pair: [
                                        { name: "iPadOS 26.5 RC build", date: "May 4, 2026", note: "build 2: May 8, 2026" },
                                        { name: "iPadOS 26.5 final build", date: "May 11, 2026" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "iPadOS 26.5.2", date: "Jun 29, 2026" }
                            ]
                        },
                        "26-6": {
                            label: "iPadOS 26.6",
                            releases: [
                                { name: "iPadOS 26.6 beta 1", date: "May 26, 2026" },
                                { name: "iPadOS 26.6 beta 2", date: "Jun 15, 2026" },
                                { name: "iPadOS 26.6 beta 3", date: "Jun 29, 2026" },
                                { name: "iPadOS 26.6 beta 4", date: "Jul 6, 2026" },
                                { name: "iPadOS 26.6 beta 5", date: "Jul 13, 2026", spanTwo: true },
                                {
                                    pair: [
                                        { name: "iPadOS 26.6 RC build", date: "Jul 20, 2026" },
                                        { name: "iPadOS 26.6 final build", date: "Jul 27, 2026" }
            
                                    ],
                                    className: "release-pair-builds"
                                },
                            ],
                            supplemental: [
                                { 
                                    pair: [
                                        { date: "iPadOS 26.6.1", note: "RC build: Aug 10, 2026\nFinal build: Aug 17, 2026" },
                                        { date: "iPadOS 26.6.2", note: "Final build: Sep 8, 2026" },
                                    ]
                                }    
                            ]
                        },
                        "26-7-x": {
                            label: "iPadOS 26.7.x",
                            releases: [
                                {
                                    pair: [
                                        { date: "iPadOS 26.7", note: "RC build: Sep 9, 2026\nFinal build: Sep 14, 2026" },
                                        { date: "iPadOS 26.7.1", note: "Final build: Sep 28, 2026" },                            
                                    ],
                                    className: "release-pair-tight"
                                },
                                {
                                    pair: [
                                        { date: "iPadOS 26.7.2", note: "RC build: Oct 19, 2026\nFinal build: Oct 26, 2026" },
                                        { date: "iPadOS 26.7.3", note: "Final build: Nov 9, 2026" },
                                    ],
                                    className: "release-pair-tight"
                                },
                            ]
                        }
                    };
            initializeTimelinePage(timelines);
        },
        "ipados-27.html": () => {
            const timelines = {
                        "27-0": {
                            label: "iPadOS 27.0",
                            releases: [
                                { name: "iPadOS 27.0 beta 1", date: "Jun 8, 2026" },
                                { name: "iPadOS 27.0 beta 2", date: "Jun 22, 2026" },
                                { name: "iPadOS 27.0 beta 3", date: "Jul 6, 2026", note: "build 2: Jul 13, 2026" },
                                { name: "iPadOS 27.0 beta 4", date: "Jul 20, 2026" },
                                { name: "iPadOS 27.0 beta 5", date: "Aug 10, 2026" },
                                { name: "iPadOS 27.0 beta 6", date: "Aug 17, 2026" },
                                { name: "iPadOS 27.0 beta 7", date: "Aug 24, 2026" },
                                { name: "iPadOS 27.0 beta 8", date: "Aug 31, 2026" },
                                {
                                    pair: [
                                        { name: "iPadOS 27.0 RC build", date: "Sep 9, 2026" },
                                        { name: "iPadOS 27.0 final build", date: "Sep 14, 2026" },
                                    ],
                                    className: "release-pair-builds"
                                },                    
                            ],
                            supplemental: [
                                { name: "iPadOS 27.0.1", date: "Sep 28, 2026" },
                            ]
                        },
                        "27-2": {
                            label: "iPadOS 27.2",
                            releases: [
                                { name: "iPadOS 27.2 beta 1", date: "Sep 16, 2026" },
                                { name: "iPadOS 27.2 beta 2", date: "Sep 21, 2026" },
                                { name: "iPadOS 27.2 beta 3", date: "Oct 5, 2026" },
                                { name: "iPadOS 27.2 beta 4", date: "Oct 13, 2026" },
                                { 
                                    pair: [
                                        { name: "iPadOS 27.2 RC build", date: "Oct 19, 2026" },
                                        { name: "iPadOS 27.2 final build", date: "Oct 26, 2026" },
                                    ],
                                    className: "release-pair-builds"
                                },
                            ],
                            supplemental: [
                                { name: "iPadOS 27.2.1", date: "Nov 9, 2026" },
                            ],
                        },
                        "27-3": {
                            label: "iPadOS 27.3",
                            releases: [
                                { name: "iPadOS 27.3 beta 1", date: "Nov 3, 2026", spanTwo: true },
                            ]
                        }
                    };
            initializeTimelinePage(timelines);
        },
        "macos-10-12.html": () => {
            const timelines = {
                        "10-12": {
                            label: "macOS 10.12",
                            releases: [
                                { name: "macOS 10.12 beta 1", date: "June 13, 2016", alignment: "left" },
                                { name: "macOS 10.12 beta 2", date: "July 5, 2016", note: "build 2: July 8, 2016", alignment: "right" },
                                { name: "macOS 10.12 beta 3", date: "July 18, 2016", alignment: "left" },
                                { name: "macOS 10.12 beta 4", date: "August 1, 2016", alignment: "right" },
                                { name: "macOS 10.12 beta 5", date: "August 9, 2016", alignment: "left" },
                                { name: "macOS 10.12 beta 6", date: "August 15, 2016", alignment: "right" },
                                { name: "macOS 10.12 beta 7", date: "August 21, 2016", alignment: "left" },
                                { name: "macOS 10.12 beta 8", date: "August 26, 2016", alignment: "right" },
                                {
                                    pair: [
                                        { name: "macOS 10.12 GM build", date: "September 7, 2016", note: "build 2: September 13, 2016\nbuild 3: September 15, 2016" },
                                        { name: "macOS 10.12 final build", date: "September 20, 2016" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "10-12-1": {
                            label: "macOS 10.12.1",
                            releases: [
                                { name: "macOS 10.12.1 beta 1", date: "September 21, 2016", alignment: "left" },
                                { name: "macOS 10.12.1 beta 2", date: "September 27, 2016", alignment: "right" },
                                { name: "macOS 10.12.1 beta 3", date: "October 3, 2016", alignment: "left" },
                                { name: "macOS 10.12.1 beta 4", date: "October 11, 2016", alignment: "right" },
                                { name: "macOS 10.12.1 beta 5", date: "October 19, 2016", spanTwo: true },
                                { name: "macOS 10.12.1 final build", date: "October 24, 2016", spanTwo: true }
                            ],
                        },
                        "10-12-2": {
                            label: "macOS 10.12.2",
                            releases: [
                                { name: "macOS 10.12.2 beta 1", date: "October 31, 2016", note: "build 2: November 2, 2016", alignment: "left" },
                                { name: "macOS 10.12.2 beta 2", date: "November 8, 2016", alignment: "right" },
                                { name: "macOS 10.12.2 beta 3", date: "November 14, 2016", alignment: "left" },
                                { name: "macOS 10.12.2 beta 4", date: "November 28, 2016", alignment: "right" },
                                { name: "macOS 10.12.2 beta 5", date: "December 5, 2016", alignment: "left" },
                                { name: "macOS 10.12.2 beta 6", date: "December 8, 2016", alignment: "right" },
                                { name: "macOS 10.12.2 final build", date: "December 13, 2016", note: "build 2: December 14, 2016", spanTwo: true }
                            ],
                        },
                        "10-12-3": {
                            label: "macOS 10.12.3",
                            releases: [
                                { name: "macOS 10.12.3 beta 1", date: "December 14, 2016", alignment: "left" },
                                { name: "macOS 10.12.3 beta 2", date: "December 20, 2016", alignment: "right" },
                                { name: "macOS 10.12.3 beta 3", date: "January 9, 2017", alignment: "left" },
                                { name: "macOS 10.12.3 beta 4", date: "January 12, 2017", alignment: "right" },
                                { name: "macOS 10.12.3 final build", date: "January 23, 2017", spanTwo: true }
                            ],
                        },
                        "10-12-4": {
                            label: "macOS 10.12.4",
                            releases: [
                                { name: "macOS 10.12.4 beta 1", date: "January 24, 2017", alignment: "left" },
                                { name: "macOS 10.12.4 beta 2", date: "February 7, 2017", alignment: "right" },
                                { name: "macOS 10.12.4 beta 3", date: "February 20, 2017", alignment: "left" },
                                { name: "macOS 10.12.4 beta 4", date: "February 27, 2017", alignment: "right" },
                                { name: "macOS 10.12.4 beta 5", date: "March 7, 2017", alignment: "left" },
                                { name: "macOS 10.12.4 beta 6", date: "March 13, 2017", alignment: "right" },
                                { name: "macOS 10.12.4 beta 7", date: "March 16, 2017", alignment: "left" },
                                { name: "macOS 10.12.4 beta 8", date: "March 20, 2017", alignment: "right" },
                                { name: "macOS 10.12.4 final build", date: "March 27, 2017", spanTwo: true },
                            ],
                        },
                        "10-12-5": {
                            label: "macOS 10.12.5",
                            releases: [
                                { name: "macOS 10.12.5 beta 1", date: "March 28, 2017", alignment: "left" },
                                { name: "macOS 10.12.5 beta 2", date: "April 10, 2017", alignment: "right" },
                                { name: "macOS 10.12.5 beta 3", date: "April 17, 2017", alignment: "left" },
                                { name: "macOS 10.12.5 beta 4", date: "April 24, 2017", alignment: "right" },
                                { name: "macOS 10.12.5 beta 5", date: "May 1, 2017", spanTwo: true },
                                { name: "macOS 10.12.5 final build", date: "May 15, 2017", spanTwo: true }
                            ],
                        },
                        "10-12-6": {
                            label: "macOS 10.12.6",
                            footnote: "1: 2019-001 continues 2018-004 beta 2.",
                            gridMaxWidth: "1310px",
                            sectionedLayout: true,
                            releases: [
                                { mainLabel: "Main Update" },
                                { name: "macOS 10.12.6 beta 1", date: "May 16, 2017", alignment: "left" },
                                { name: "macOS 10.12.6 beta 2", date: "May 30, 2017", alignment: "right" },
                                { name: "macOS 10.12.6 beta 3", date: "June 13, 2017", alignment: "left" },
                                { name: "macOS 10.12.6 beta 4", date: "June 19, 2017", alignment: "right" },
                                { name: "macOS 10.12.6 beta 5", date: "June 28, 2017", alignment: "left" },
                                { name: "macOS 10.12.6 beta 6", date: "July 5, 2017", alignment: "right" },
                                { name: "macOS 10.12.6 final build", date: "July 19, 2017", spanTwo: true },
                                { 
                                    sectionLabel: "Security Updates",
                                    sectionWidth: "wide",
                                    sectionLayout: "security-grid",
                                },
                                { 
                                    pair: [
                                        { date: "2017-001", note: "beta 1: Sep 27, 2017\nbeta 2: Oct 9, 2017\nbeta 3: Oct 17, 2017\nbeta 4: Oct 23, 2017\nFinal build: Oct 31, 2017" },
                                        { date: "2017-002", note: "beta 1: Oct 31, 2017\nbeta 2: Nov 6, 2017\nbeta 3: Nov 13, 2017\nbeta 4: Nov 16, 2017\nFinal build: Dec 6, 2017" },
                                ],
                                className: "release-pair-tight"
                                },
                                { 
                                    quad: [
                                        { date: "2018-001", note: "beta 3: Dec 18, 2017\nbeta 2: Jan 3, 2018\nbeta 3: Jan 9, 2018\nbeta 4: Jan 16, 2018\nbeta 5: Jan 19, 2018\nFinal build: Jan 23, 2018" },
                                        { date: "2018-002", note: "beta 1: Feb 6, 2018\nbeta 2: Mar 5, 2018\nFinal build: Mar 29, 2018" },
                                        { date: "2018-003", note: "beta 1: Apr 3, 2018\nbeta 2: Apr 17, 2018\nbeta 3: May 1, 2018\nFinal build: Jun 1, 2018", },
                                        { date: "2018-004", note: "beta 1: May 30, 2018\nbeta 2: Jun 11, 2018\nbeta 3: Jun 25, 2018\nbeta 4: Jul 2, 2018\nFinal build: Jul 9, 2018" },
                                ],
                                className: "release-quad-tight",
                                securityRow: "2021"
                                },
                                {
                                    trio: [
                                        { date: "2018-005", note: "beta 1: Oct 2, 2018\nbeta 2: Oct 8, 2018\nbeta 3: Oct 17, 2018\nFinal build: Oct 30, 2018" },
                                        { date: "2018-006", note: "beta 1: Oct 31, 2018\nbeta 2: Nov 7, 2018\nbeta 3: Nov 15, 2018\nFinal build: Dec 5, 2018" },
                                        { date: "2018-007", note: "beta 1: Dec 11, 2018\nbeta 2: Dec 19, 2018" },
                                    ],
                                    className: "release-trio-tight",
                                    securityRow: "2021"
                                },
                                {
                                    trio: [
                                        { date: "2019-001", note: "beta 2:&#185; Jan 7, 2019\nFinal build: Jan 22, 2019" },
                                        { date: "2019-002", note: "beta 1: Jan 24, 2019\nbeta 2: Feb 4, 2019\nbeta 3: Feb 18, 2019\nbeta 4: Mar 4, 2019\nbeta 5: Mar 12, 2019\nFinal build: Mar 25, 2019\nFinal build 2: Mar 29, 2019" },
                                        { date: "2019-003", note: "beta 1: Mar 27, 2019\nbeta 2: Apr 8, 2019\nbeta 3: Apr 22, 2019\nbeta 4: Apr 30, 2019\nbeta 5: May 7, 2019\nFinal build: May 14, 2019", },
                                    ],
                                    className: "release-trio-tight",
                                    securityRow: "2022"
                                },
                                {
                                    pair: [
                                        { date: "2019-004", note: "beta 1: May 15, 2019\nbeta 2: Jun 11, 2019\nbeta 3: Jun 24, 2019\nbeta 4: Jul 9, 2019\nFinal build: Jul 22, 2019\nFinal build 2: Jul 29, 2019", },                            
                                        { date: "2019-005", note: "Final build: Sep 26, 2019" },
                                    ],
                                    className: "release-pair-tight",
                                    securityRow: "2022"
                                }
                            ],
                        },
                    };
            
                    const versionSelect = document.getElementById("software-version");
                    const releaseGrid = document.getElementById("release-grid");
                    const timelinePickerNote = document.getElementById("timeline-picker-note");
                    const timelineIntro = document.getElementById("timeline-intro-mac");
                    const timelineFootnote = document.getElementById("timeline-footnote");
                    const defaultPickerNote = "macOS 10.12 also known as macOS Sierra";
            
                    function releaseMarkup(release) {
                        if (release.mainLabel) {
                            return `<p class="section-label span-two">${release.mainLabel}</p>`;
                        }
            
                        if (release.supplementalLabel || release.sectionLabel) {
                            return `<p class="section-label section-label-divider span-two">${release.supplementalLabel ?? release.sectionLabel}</p>`;
                        }
            
                        if (release.trio) {
                            const className = release.className ? ` ${release.className}` : "";
                            return `<div class="release-trio${className}">${release.trio.map(releaseMarkup).join("")}</div>`;
                        }
            
                        if (release.quad) {
                            const className = release.className ? " " + release.className : "";
                            return `<div class="release-quad${className}">${release.quad.map(releaseMarkup).join("")}</div>`;
                        }
                        if (release.pair) {
                            const className = release.className ? ` ${release.className}` : "";
                            return `<div class="release-pair${className}">${release.pair.map(releaseMarkup).join("")}</div>`;
                        }
            
                        const spanClass = release.spanTwo ? " span-two" : "";
                        const alignmentClass = release.alignment ? ` release-align-${release.alignment}` : "";
                        const name = release.name ? `<p class="release-name">${release.name}</p>` : "";
                        const note = release.note ? `<p class="release-note">${release.note}</p>` : "";
                        return `<article class="release${spanClass}${alignmentClass}">
                            ${name}
                            <p class="release-date">${release.date}</p>${note}
                        </article>`;
                    }
            
                    function sectionedReleasesMarkup(releases) {
                        const sections = [{ width: "standard", layout: "default", releases: [] }];
            
                        releases.forEach((release) => {
                            if (release.sectionWidth === "wide" && sections.at(-1).releases.length) {
                                sections.push({
                                    width: "wide",
                                    layout: release.sectionLayout ?? "default",
                                    releases: []
                                });
                            }
                            sections.at(-1).releases.push(release);
                        });
            
                        return sections.map((section) => {
                            const widthClass = section.width === "wide" ? " release-section-wide" : "";
                            if (section.layout === "security-grid") {
                                const flatten = (release) => {
                                    if (release.pair) return release.pair.flatMap(flatten);
                                    if (release.trio) return release.trio.flatMap(flatten);
                                    if (release.quad) return release.quad.flatMap(flatten);
                                    return [release];
                                };
                                const desktopRows = [];
            
                                section.releases.forEach((release) => {
                                    if (release.sectionLabel) {
                                        desktopRows.push({ label: release });
                                        return;
                                    }
                                    const previousRow = desktopRows.at(-1);
                                    if (release.securityRow && previousRow?.key === release.securityRow) {
                                        previousRow.releases.push(release);
                                        return;
                                    }
                                    desktopRows.push({ key: release.securityRow, releases: [release] });
                                });
            
                                const desktopMarkup = desktopRows.map((row) => {
                                    if (row.label) return releaseMarkup(row.label);
                                    const rowReleases = row.releases.flatMap(flatten);
                                    return `<div class="security-update-row security-update-row--${rowReleases.length}">
                                        ${rowReleases.map(releaseMarkup).join("")}
                                    </div>`;
                                }).join("");
            
                            const mobileMarkup = section.releases.map((release) => {
                                if (release.sectionLabel) return releaseMarkup(release);
                                const releases = flatten(release);
                                return releases.reduce((rows, release, index) => {
                                    if (index % 3 === 0) rows.push([]);
                                    rows.at(-1).push(release);
                                    return rows;
                                }, []).map((row) => `<div class="security-update-mobile-row security-update-mobile-row--${row.length}">
                                    ${row.map(releaseMarkup).join("")}
                                </div>`).join("");
                            }).join("");
            
                                return `<section class="release-section${widthClass}">
                                    <div class="security-update-desktop span-two">${desktopMarkup}</div>
                                <div class="security-update-mobile">${mobileMarkup}</div>
                                </section>`;
                            }
            
                            return `<section class="release-section${widthClass}">
                                ${section.releases.map(releaseMarkup).join("")}
                            </section>`;
                        }).join("");
                    }
            
                    function renderTimeline() {
                        const timeline = timelines[versionSelect.value];
            
                        if (!timeline) {
                            releaseGrid.setAttribute("aria-label", "Timeline coming soon");
                            releaseGrid.innerHTML = '<p class="timeline-message span-two">This timeline is coming soon</p>';
                            timelinePickerNote.textContent = defaultPickerNote;
                            timelineIntro.hidden = true;
                            timelineIntro.textContent = "";
                            timelineIntro.classList.remove("timeline-intro-after-supplemental");
                            timelineFootnote.hidden = true;
                            timelineFootnote.textContent = "";
                            return;
                        }
            
                        releaseGrid.setAttribute("aria-label", `${timeline.label} release dates`);
                        timelinePickerNote.textContent = timeline.pickerNote ?? defaultPickerNote;
                        timelineIntro.textContent = timeline.intro ?? "";
                        timelineIntro.hidden = !timeline.intro;
                        timelineIntro.classList.toggle(
                            "timeline-intro-after-supplemental",
                            Boolean(timeline.supplemental?.length)
                        );
                        timelineFootnote.textContent = timeline.footnote ?? "";
                        timelineFootnote.hidden = !timeline.footnote;
                        if (timeline.gridMaxWidth) {
                            releaseGrid.style.setProperty("--timeline-grid-max-width", timeline.gridMaxWidth);
                        } else {
                            releaseGrid.style.removeProperty("--timeline-grid-max-width");
                        }
                        let markup = timeline.mainLabel
                            ? `<p class="section-label span-two">${timeline.mainLabel}</p>`
                            : "";
                        markup += timeline.sectionedLayout
                            ? sectionedReleasesMarkup(timeline.releases)
                            : timeline.releases.map(releaseMarkup).join("");
            
                        if (timeline.supplemental?.length) {
                            markup += `<section class="span-two supplemental" aria-label="Supplemental releases">
                                <p class="section-label">${timeline.supplementalLabel ?? "Supplemental Updates"}</p>
                                ${timeline.supplemental.map(releaseMarkup).join("")}
                            </section>`;
                        }
            
                        releaseGrid.innerHTML = markup;
                    }
            
                    versionSelect.addEventListener("change", renderTimeline);
                    renderTimeline();
        },
        "macos-10-13.html": () => {
            const timelines = {
                        "10-13": {
                            label: "macOS 10.13",
                            releases: [
                                { name: "macOS 10.13 beta 1", date: "June 5, 2017", note: "build 2: June 7, 2017", alignment: "left" },
                                { name: "macOS 10.13 beta 2", date: "June 21, 2017", note: "build 2: June 29, 2017", alignment: "right" },
                                { name: "macOS 10.13 beta 3", date: "July 10, 2017", alignment: "left" },
                                { name: "macOS 10.13 beta 4", date: "July 24, 2017", alignment: "right" },
                                { name: "macOS 10.13 beta 5", date: "August 7, 2017", alignment: "left" },
                                { name: "macOS 10.13 beta 6", date: "August 14, 2017", alignment: "right" },
                                { name: "macOS 10.13 beta 7", date: "August 21, 2017", alignment: "left" },
                                { name: "macOS 10.13 beta 8", date: "August 28, 2017", alignment: "right" },
                                { name: "macOS 10.13 beta 9", date: "September 1, 2017", spanTwo: true },
                                {
                                    pair: [
                                        { name: "macOS 10.13 GM build", date: "September 14, 2017" },
                                        { name: "macOS 10.13 final build", date: "September 25, 2017", note: "build 2: October 5, 2017" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "10-13-1": {
                            label: "macOS 10.13.1",
                            releases: [
                                { name: "macOS 10.13.1 beta 1", date: "September 27, 2017", alignment: "left" },
                                { name: "macOS 10.13.1 beta 2", date: "October 9, 2017", alignment: "right" },
                                { name: "macOS 10.13.1 beta 3", date: "October 17, 2017", alignment: "left" },
                                { name: "macOS 10.13.1 beta 4", date: "October 23, 2017", alignment: "right" },
                                { name: "macOS 10.13.1 beta 5", date: "October 26, 2017", spanTwo: true },
                                { name: "macOS 10.13.1 final build", date: "October 31, 2017", spanTwo: true },
                                { name: "macOS 10.13.1 Security Update 2017-001", date: "November 29, 2017", note: "build 2: November 30, 2017", spanTwo: true },
                            ],
                        },
                        "10-13-2": {
                            label: "macOS 10.13.2",
                            releases: [
                                { name: "macOS 10.13.2 beta 1", date: "October 31, 2017", alignment: "left" },
                                { name: "macOS 10.13.2 beta 2", date: "November 6, 2017", alignment: "right" },
                                { name: "macOS 10.13.2 beta 3", date: "November 13, 2017", alignment: "left" },
                                { name: "macOS 10.13.2 beta 4", date: "November 16, 2017", alignment: "right" },
                                { name: "macOS 10.13.2 beta 5", date: "November 28, 2017", alignment: "left" },
                                { name: "macOS 10.13.2 beta 6", date: "December 1, 2017", alignment: "right" },
                                { name: "macOS 10.13.2 final build", date: "December 6, 2017", spanTwo: true }
                            ],
                            supplemental: [
                                { name: "macOS 10.13.2 Supplemental Update", date: "January 8, 2018" },
                            ]
                        },
                        "10-13-3": {
                            label: "macOS 10.13.3",
                            releases: [
                                { name: "macOS 10.13.3 beta 1", date: "December 13, 2017", alignment: "left" },
                                { name: "macOS 10.13.3 beta 2", date: "December 19, 2017", alignment: "right" },
                                { name: "macOS 10.13.3 beta 3", date: "January 3, 2018", alignment: "left" },
                                { name: "macOS 10.13.3 beta 4", date: "January 9, 2018", alignment: "right" },
                                { name: "macOS 10.13.3 beta 5", date: "January 16, 2018", alignment: "right" },
                                { name: "macOS 10.13.3 beta 6", date: "January 19, 2018", spanTwo: true },
                                { name: "macOS 10.13.3 final build", date: "January 23, 2018", spanTwo: true }
                            ],
                            supplemental: [
                                { name: "macOS 10.13.3 Supplemental Update", date: "February 19, 2018" }
                                ]
                        },
                        "10-13-4": {
                            label: "macOS 10.13.4",
                            releases: [
                                { name: "macOS 10.13.4 beta 1", date: "January 24, 2018", alignment: "left" },
                                { name: "macOS 10.13.4 beta 2", date: "February 6, 2018", note: "build 2: February 8, 2018", alignment: "right" },
                                { name: "macOS 10.13.4 beta 3", date: "February 20, 2018", alignment: "left" },
                                { name: "macOS 10.13.4 beta 4", date: "March 5, 2018", alignment: "right" },
                                { name: "macOS 10.13.4 beta 5", date: "March 12, 2018", alignment: "left" },
                                { name: "macOS 10.13.4 beta 6", date: "March 19, 2018", alignment: "right" },
                                { name: "macOS 10.13.4 final build", date: "March 29, 2018", spanTwo: true }
                            ],
                            supplemental: [
                                { name: "macOS 10.13.4 Security Update 2018-001", date: "April 24, 2018" }
                                ]
                        },
                        "10-13-5": {
                            label: "macOS 10.13.5",
                            releases: [
                                { name: "macOS 10.13.5 beta 1", date: "April 3, 2018", alignment: "left" },
                                { name: "macOS 10.13.5 beta 2", date: "April 17, 2018", alignment: "right" },
                                { name: "macOS 10.13.5 beta 3", date: "May 1, 2018", alignment: "left" },
                                { name: "macOS 10.13.5 beta 4", date: "May 7, 2018", alignment: "right" },
                                { name: "macOS 10.13.5 beta 5", date: "May 14, 2018", spanTwo: true },
                                { name: "macOS 10.13.5 final build", date: "June 1, 2018", spanTwo: true }
                            ]
                        },
                        "10-13-6": {
                            label: "macOS 10.13.6",
                            footnote: "1: Supplemental Updates only released for MacBook Pro models from 2018.\n2: 2019-001 continues 2018-004 beta 2.\n3: 2020-001 beta 2 continues 2019-008.",
                            gridMaxWidth: "1550px",
                            sectionedLayout: true,
                            releases: [
                                { mainLabel: "Main Update" },
                                { name: "macOS 10.13.6 beta 1", date: "May 30, 2018", alignment: "left" },
                                { name: "macOS 10.13.6 beta 2", date: "June 11, 2018", alignment: "right" },
                                { name: "macOS 10.13.6 beta 3", date: "June 18, 2018", alignment: "left" },
                                { name: "macOS 10.13.6 beta 4", date: "June 25, 2018", alignment: "right" },
                                { name: "macOS 10.13.6 beta 5", date: "July 2, 2018", spanTwo: true },
                                { name: "macOS 10.13.6 final build", date: "July 9, 2018", note: "build 2: July 12, 2018", spanTwo: true },
                                { supplementalLabel: "Supplemental Updates&#185;" },
                                { name: "macOS 10.13.6 Supplemental Update 1", date: "July 24, 2018", alignment: "left" },
                                { name: "macOS 10.13.6 Supplemental Update 2", date: "August 28, 2018", alignment: "right" },
                                { 
                                    sectionLabel: "Security Updates",
                                    sectionWidth: "wide",
                                    sectionLayout: "security-grid",
                                },
                                { 
                                    trio: [
                                        { date: "2018-002", note: "beta 1: Oct 2, 2018\nbeta 2: Oct 8, 2018\nbeta 3: Oct 17, 2018\nFinal build: Oct 30, 2018" },
                                        { date: "2018-003", note: "beta 1: Oct 31, 2018\nbeta 2: Nov 7, 2018\nbeta 3: Nov 15, 2018\nbeta 4: Nov 28, 2018\nFinal build: Dec 5, 2018" },
                                        { date: "2018-004", note: "beta 1: Dec 11, 2018\nbeta 2: Dec 19, 2018" },
                                ],
                                className: "release-trio-tight"
                                },
                                { 
                                    quad: [
                                        { date: "2019-001", note: "beta 3:&#178; Jan 7, 2019\nFinal build: Jan 22, 2019" },
                                        { date: "2019-002", note: "beta 1: Jan 24, 2019\nbeta 2: Feb 4, 2019\nbeta 3: Feb 18, 2019\nbeta 4: Mar 4, 2019\nbeta 5: Mar 11, 2019\nbeta 6: Mar 18, 2019\nFinal build: Mar 25, 2019\nFinal build 2: Mar 29, 2019" },
                                        { date: "2019-003", note: "beta 1: Mar 27, 2019\nbeta 2: Apr 8, 2019\nbeta 3: Apr 22, 2019\nbeta 4: Apr 30, 2019\nbeta 5: May 7, 2019\nbeta 6: May 8, 2019\nFinal build: May 13, 2019", },
                                        { date: "2019-004", note: "beta 1: May 15, 2019\nbeta 2: Jun 11, 2019\nbeta 3: Jun 24, 2019\nbeta 4: Jul 9, 2019\nFinal build: Jul 22, 2019\nFinal build 2: Jul 29, 2019" },
                                ],
                                className: "release-quad-tight",
                                securityRow: "2021"
                                },
                                {
                                    quad: [
                                        { date: "2019-005", note: "Final build: Sep 26, 2019" },
                                        { date: "2019-006", note: "beta 1: Oct 11, 2019\nbeta 2: Oct 17, 2019\nbeta 3: Oct 24, 2019\nFinal build: Oct 29, 2019" },
                                        { date: "2019-007", note: "beta 1: Nov 7, 2019\nbeta 2: Nov 13, 2019\nbeta 3: Nov 20, 2019\nbeta 4: Dec 6, 2019\nFinal build: Dec 10, 2019" },
                                        { date: "2019-008", note: "beta 1: Dec 17, 2019" },
                                    ],
                                    className: "release-quad-tight",
                                    securityRow: "2021"
                                },
                                {
                                    trio: [
                                        { date: "2020-001", note: "beta 2:&#179; Jan 14, 2020\nbeta 3: Jan 22, 2020\nFinal build: Jan 28, 2020" },
                                        { date: "2020-002", note: "beta 1: Feb 5, 2020\nbeta 2: Feb 19, 2020\nbeta 3: Feb 26, 2020\nbeta 4: Mar 3, 2020\nbeta 5: Mar 10, 2020\n beta 6: Mar 18, 2020\nFinal build: Mar 24, 2020" },
                                        { date: "2020-003", note: "beta 1: Mar 31, 2020\nbeta 2: Apr 16, 2020\nbeta 3: Apr 30, 2020\nbeta 4: May 8, 2020\nbeta 5: May 20, 2020\nFinal build: May 26, 2020\nFinal build 2: Jun 1, 2020", },
                                    ],
                                    className: "release-trio-tight",
                                    securityRow: "2022"
                                },
                                {
                                    trio: [
                                        { date: "2020-004", note: "beta 1: Jun 1, 2020\nbeta 2: Jun 9, 2020\nbeta 3: Jul 9, 2020\nFinal build: Jul 15, 2020", },                            
                                        { date: "2020-005", note: "beta 1: Sep 10, 2020\nFinal build: Sep 24, 2020" },
                                        { date: "2020-006", note: "Final build: Nov 12, 2020" },
                                    ],
                                    className: "release-trio-tight",
                                    securityRow: "2022"
                                }
                            ],
                        },
                    };
            
                    const versionSelect = document.getElementById("software-version");
                    const releaseGrid = document.getElementById("release-grid");
                    const timelinePickerNote = document.getElementById("timeline-picker-note");
                    const timelineIntro = document.getElementById("timeline-intro-mac");
                    const timelineFootnote = document.getElementById("timeline-footnote");
                    const defaultPickerNote = "macOS 10.13 also known as macOS High Sierra";
            
                    function releaseMarkup(release) {
                        if (release.mainLabel) {
                            return `<p class="section-label span-two">${release.mainLabel}</p>`;
                        }
            
                        if (release.supplementalLabel) {
                            return `<p class="section-label section-label-divider span-two">${release.supplementalLabel}</p>`;
                        }
            
                        if (release.sectionLabel) {
                            return `<p class="section-label section-label-divider span-two">${release.sectionLabel}</p>`;
                        }
            
                        if (release.trio) {
                            const className = release.className ? ` ${release.className}` : "";
                            return `<div class="release-trio${className}">${release.trio.map(releaseMarkup).join("")}</div>`;
                        }
            
                        if (release.quad) {
                            const className = release.className ? " " + release.className : "";
                            return `<div class="release-quad${className}">${release.quad.map(releaseMarkup).join("")}</div>`;
                        }
                        if (release.pair) {
                            const className = release.className ? ` ${release.className}` : "";
                            return `<div class="release-pair${className}">${release.pair.map(releaseMarkup).join("")}</div>`;
                        }
            
                        const spanClass = release.spanTwo ? " span-two" : "";
                        const alignmentClass = release.alignment ? ` release-align-${release.alignment}` : "";
                        const name = release.name ? `<p class="release-name">${release.name}</p>` : "";
                        const note = release.note ? `<p class="release-note">${release.note}</p>` : "";
                        return `<article class="release${spanClass}${alignmentClass}">
                            ${name}
                            <p class="release-date">${release.date}</p>${note}
                        </article>`;
                    }
            
                    function sectionedReleasesMarkup(releases) {
                        const sections = [{ width: "standard", layout: "default", releases: [] }];
            
                        releases.forEach((release) => {
                            if (release.sectionWidth === "wide" && sections.at(-1).releases.length) {
                                sections.push({
                                    width: "wide",
                                    layout: release.sectionLayout ?? "default",
                                    releases: []
                                });
                            }
                            sections.at(-1).releases.push(release);
                        });
            
                        return sections.map((section) => {
                            const widthClass = section.width === "wide" ? " release-section-wide" : "";
                            if (section.layout === "security-grid") {
                                const flatten = (release) => {
                                    if (release.pair) return release.pair.flatMap(flatten);
                                    if (release.trio) return release.trio.flatMap(flatten);
                                    if (release.quad) return release.quad.flatMap(flatten);
                                    return [release];
                                };
                                const desktopRows = [];
            
                                section.releases.forEach((release) => {
                                    if (release.sectionLabel) {
                                        desktopRows.push({ label: release });
                                        return;
                                    }
            
                                    const previousRow = desktopRows.at(-1);
                                    if (release.securityRow && previousRow?.key === release.securityRow) {
                                        previousRow.releases.push(release);
                                        return;
                                    }
            
                                    desktopRows.push({ key: release.securityRow, releases: [release] });
                                });
            
                                const desktopMarkup = desktopRows.map((row) => {
                                    if (row.label) return releaseMarkup(row.label);
                                    const rowReleases = row.releases.flatMap(flatten);
                                    return `<div class="security-update-row security-update-row--${rowReleases.length}">
                                        ${rowReleases.map(releaseMarkup).join("")}
                                    </div>`;
                                }).join("");
                                const mobileMarkup = section.releases.map((release) => {
                                    if (release.sectionLabel) return releaseMarkup(release);
                                    const releases = flatten(release);
                                    return releases.reduce((rows, release, index) => {
                                        if (index % 3 === 0) rows.push([]);
                                        rows.at(-1).push(release);
                                        return rows;
                                    }, []).map((row) => `<div class="security-update-mobile-row security-update-mobile-row--${row.length}">
                                        ${row.map(releaseMarkup).join("")}
                                    </div>`).join("");
                                }).join("");
                                return `<section class="release-section${widthClass}">
                                    <div class="security-update-desktop span-two">
                                        ${desktopMarkup}
                                    </div>
                                    <div class="security-update-mobile">${mobileMarkup}</div>
                                </section>`;
                            }
                            return `<section class="release-section${widthClass}">
                                ${section.releases.map(releaseMarkup).join("")}
                            </section>`;
                        }).join("");
                    }
            
                    function renderTimeline() {
                        const timeline = timelines[versionSelect.value];
            
                        if (!timeline) {
                            releaseGrid.setAttribute("aria-label", "Timeline coming soon");
                            releaseGrid.innerHTML = '<p class="timeline-message span-two">This timeline is coming soon</p>';
                            timelineIntro.hidden = true;
                            timelineIntro.textContent = "";
                            timelineIntro.classList.remove("timeline-intro-after-supplemental");
                            timelineFootnote.hidden = true;
                            timelineFootnote.textContent = "";
                            return;
                        }
            
                        releaseGrid.setAttribute("aria-label", `${timeline.label} release dates`);
                        timelinePickerNote.textContent = timeline.pickerNote ?? defaultPickerNote;
                        timelineIntro.textContent = timeline.intro ?? "";
                        timelineIntro.hidden = !timeline.intro;
                        timelineIntro.classList.toggle(
                        "timeline-intro-after-supplemental",
                        Boolean(timeline.supplemental?.length)
                        );
                        timelineFootnote.textContent = timeline.footnote ?? "";
                        timelineFootnote.hidden = !timeline.footnote;
                        if (timeline.gridMaxWidth) {
                            releaseGrid.style.setProperty("--timeline-grid-max-width", timeline.gridMaxWidth);
                        } else {
                            releaseGrid.style.removeProperty("--timeline-grid-max-width");
                        }
                        let markup = timeline.mainLabel
                            ? `<p class="section-label span-two">${timeline.mainLabel}</p>`
                            : "";
                        markup += timeline.sectionedLayout
                            ? sectionedReleasesMarkup(timeline.releases)
                            : timeline.releases.map(releaseMarkup).join("");
            
                        if (timeline.supplemental?.length) {
                            markup += `<section class="span-two supplemental" aria-label="Supplemental Updates">
                                <p class="section-label">${timeline.supplementalLabel ?? "Supplemental Updates"}</p>
                                ${timeline.supplemental.map(releaseMarkup).join("")}
                            </section>`;
                        }
            
                        releaseGrid.innerHTML = markup;
                    }
            
                    versionSelect.addEventListener("change", renderTimeline);
                    renderTimeline();
        },
        "macos-10-14.html": () => {
            const timelines = {
                        "10-14": {
                            label: "macOS 10.14",
                            releases: [
                                { name: "macOS 10.14 beta 1", date: "June 4, 2018", alignment: "left" },
                                { name: "macOS 10.14 beta 2", date: "June 19, 2018", note: "build 2: June 26, 2018", alignment: "right" },
                                { name: "macOS 10.14 beta 3", date: "July 3, 2018", note: "build 2: July 11, 2018", alignment: "left" },
                                { name: "macOS 10.14 beta 4", date: "July 16, 2018", alignment: "right" },
                                { name: "macOS 10.14 beta 5", date: "July 30, 2018", alignment: "left" },
                                { name: "macOS 10.14 beta 6", date: "August 6, 2018", alignment: "right" },
                                { name: "macOS 10.14 beta 7", date: "August 13, 2018", alignment: "left" },
                                { name: "macOS 10.14 beta 8", date: "August 20, 2018", alignment: "right" },
                                { name: "macOS 10.14 beta 9", date: "August 27, 2018", alignment: "left" },
                                { name: "macOS 10.14 beta 10", date: "September 4, 2018", alignment: "right" },
                                { name: "macOS 10.14 beta 11", date: "September 12, 2018", spanTwo: true },
                                { name: "macOS 10.14 final build", date: "September 24, 2018", spanTwo: true },
                            ],
                        },
                        "10-14-1": {
                            label: "macOS 10.14.1",
                            releases: [
                                { name: "macOS 10.14.1 beta 1", date: "September 25, 2018", alignment: "left" },
                                { name: "macOS 10.14.1 beta 2", date: "October 2, 2018", alignment: "right" },
                                { name: "macOS 10.14.1 beta 3", date: "October 8, 2018", alignment: "left" },
                                { name: "macOS 10.14.1 beta 4", date: "October 17, 2018", alignment: "right" },
                                { name: "macOS 10.14.1 beta 5", date: "October 23, 2018", spanTwo: true },
                                { name: "macOS 10.14.1 final build", date: "October 30, 2018", spanTwo: true }
                            ],
                            supplemental: [
                                { name: "macOS 10.14.1 Supplemental Update", date: "November 7, 2018" },
                            ]
                        },
                        "10-14-2": {
                            label: "macOS 10.14.2",
                            releases: [
                                { name: "macOS 10.14.2 beta 1", date: "October 31, 2018", note: "build 2: November 2, 2018", alignment: "left" },
                                { name: "macOS 10.14.2 beta 2", date: "November 7, 2018", alignment: "right" },
                                { name: "macOS 10.14.2 beta 3", date: "November 15, 2018", alignment: "left" },
                                { name: "macOS 10.14.2 beta 4", date: "November 28, 2018", alignment: "right" },
                                { name: "macOS 10.14.2 final build", date: "December 5, 2018", spanTwo: true },
                            ],
                        },
                        "10-14-3": {
                            label: "macOS 10.14.3",
                            releases: [
                                { name: "macOS 10.14.3 beta 1", date: "December 10, 2018", alignment: "left" },
                                { name: "macOS 10.14.3 beta 2", date: "December 19, 2018", alignment: "right" },
                                { name: "macOS 10.14.3 beta 3", date: "January 7, 2019", alignment: "left" },
                                { name: "macOS 10.14.3 beta 4", date: "January 10, 2019", alignment: "left" },
                                { name: "macOS 10.14.3 final build", date: "January 22, 2019", spanTwo: true }
                            ],
                            supplemental: [
                                { name: "macOS 10.14.3 Supplemental Update", date: "February 7, 2019" }
                            ]
                        },
                        "10-14-4": {
                            label: "macOS 10.14.4",
                            releases: [
                                { name: "macOS 10.14.4 beta 1", date: "January 24, 2019", alignment: "left" },
                                { name: "macOS 10.14.4 beta 2", date: "February 4, 2019", alignment: "right" },
                                { name: "macOS 10.14.4 beta 3", date: "February 18, 2019", alignment: "left" },
                                { name: "macOS 10.14.4 beta 4", date: "March 4, 2019", alignment: "right" },
                                { name: "macOS 10.14.4 beta 5", date: "March 11, 2019", alignment: "left" },
                                { name: "macOS 10.14.4 beta 6", date: "March 18, 2019", alignment: "right" },
                                { name: "macOS 10.14.4 final build", date: "March 25, 2019", note: "build 2: April 18, 2019", spanTwo: true }
                            ]
                        },
                        "10-14-5": {
                            label: "macOS 10.14.5",
                            releases: [
                                { name: "macOS 10.14.5 beta 1", date: "March 27, 2019", alignment: "left" },
                                { name: "macOS 10.14.5 beta 2", date: "April 8, 2019", alignment: "right" },
                                { name: "macOS 10.14.5 beta 3", date: "April 22, 2019", alignment: "left" },
                                { name: "macOS 10.14.5 beta 4", date: "April 29, 2019", alignment: "right" },
                                { name: "macOS 10.14.5 beta 5", date: "May 7, 2019", alignment: "left" },
                                { name: "macOS 10.14.5 beta 6", date: "May 10, 2019", alignment: "right" },
                                { name: "macOS 10.14.5 final build", date: "May 13, 2019", spanTwo: true }
                            ],
                            supplemental: [
                                { name: "macOS 10.14.5 Supplemental Update", date: "May 22, 2019" },
                            ]
                        },
                        "10-14-6": {
                            label: "macOS 10.14.6",
                            footnote: "1: 2020-001 beta 2 continues 2019-003 beta 1.\n2: 2021-001 beta 2 continues 2020-008 beta 1, build 2.\n3: 2021-003 beta 2 continues 2021-002.",
                            gridMaxWidth: "1550px",
                            sectionedLayout: true,
                            releases: [
                                { mainLabel: "Main Update" },
                                { name: "macOS 10.14.6 beta 1", date: "May 15, 2019", alignment: "left" },
                                { name: "macOS 10.14.6 beta 2", date: "June 11, 2019", alignment: "right" },
                                { name: "macOS 10.14.6 beta 3", date: "June 24, 2019", alignment: "left" },
                                { name: "macOS 10.14.6 beta 4", date: "July 9, 2019", alignment: "right" },
                                { name: "macOS 10.14.6 beta 5", date: "July 15, 2019", spanTwo: true },
                                { name: "macOS 10.14.6 final build", date: "July 22, 2019", spanTwo: true },
                                { supplementalLabel: "Supplemental Updates" },
                                { name: "macOS 10.14.6 Supplemental Update 1", date: "August 1, 2019", alignment: "left" },
                                { name: "macOS 10.14.6 Supplemental Update 2", date: "August 26, 2019", alignment: "right" },
                                { name: "macOS 10.14.6 Supplemental Update 3", date: "September 26, 2019", spanTwo: true },
                                { 
                                    sectionLabel: "Security Updates",
                                    sectionWidth: "wide",
                                    sectionLayout: "security-grid",
                                },
                                { 
                                    trio: [
                                        { date: "2019-001", note: "beta 1: Oct 11, 2019\nbeta 2: Oct 17, 2019\nbeta 3: Oct 24, 2019\nFinal build: Oct 29, 2019" },
                                        { date: "2019-002", note: "beta 1: Nov 7, 2019\nbeta 2: Nov 13, 2019\nbeta 3: Nov 20, 2019\nbeta 4: Dec 6, 2019\nFinal build: Dec 10, 2019" },
                                        { date: "2019-003", note: "beta 1: Dec 17, 2019" },
                                ],
                                className: "release-trio-tight"
                                },
                                { 
                                    quad: [
                                        { date: "2020-001", note: "beta 2:&#185; Jan 14, 2020\nbeta 3: Jan 24, 2020\nFinal build: Jan 28, 2020" },
                                        { date: "2020-002", note: "beta 1: Feb 5, 2020\nbeta 2: Feb 19, 2020\nbeta 3: Feb 26, 2020\nbeta 4: Mar 3, 2020\nbeta 5: Mar 10, 2020\nbeta 6: Mar 18, 2020\nFinal build: Mar 25, 2020" },
                                        { date: "2020-003", note: "beta 1: Mar 31, 2020\nbeta 2: Apr 16, 2020\nbeta 3: Apr 30, 2020\nbeta 4: May 8, 2020\nbeta 5: May 20, 2020\nFinal build: May 26, 2020", },
                                        { date: "2020-004", note: "beta 1: Jun 1, 2020\nbeta 2: Jun 9, 2020\nbeta 3: Jun 30, 2020\nbeta 4: Jul 9, 2020\nFinal build: Jul 15, 2020" },
                                ],
                                className: "release-quad-tight",
                                securityRow: "2021"
                                },
                                {
                                    quad: [
                                        { date: "2020-005", note: "beta 1: Sep 10, 2020\nFinal build: Sep 24, 2020\nFinal build 2: Oct 1, 2020" },
                                        { date: "2020-006", note: "Final build: Nov 12, 2020" },
                                        { date: "2020-007", note: "beta 1: Nov 19, 2020\nFinal build: Dec 3, 2020\nFinal build 2: Dec 14, 2020" },
                                        { date: "2020-008", note: "beta 1: Nov 9, 2021\nbeta 2: Nov 16, 2021\nbeta 3: Dec 1, 2021\nbeta 4: Dec 7, 2021\nFinal build: Dec 13, 2021\nbeta 1, build 2: Dec 16, 2021" },
                                    ],
                                    className: "release-quad-tight",
                                    securityRow: "2021"
                                },
                                {
                                    trio: [
                                        { date: "2021-001", note: "beta 2:&#178 Jan 13, 2021\nbeta 3: Jan 22, 2021\nFinal build: Feb 1, 2021" },
                                        { date: "2021-002", note: "beta 1: Feb 2, 2021\nFinal build: Feb 9, 2021" },
                                        { date: "2021-003", note: "beta 2:&#179 Feb 17, 2021\nbeta 3: Mar 2, 2021\nbeta 4: Mar 16, 2021\nbeta 5: Mar 23, 2021\nbeta 6: Apr 20, 2021\nFinal build: Apr 26, 2021", },
                                    ],
                                    className: "release-trio-tight",
                                    securityRow: "2022"
                                },
                                {
                                    pair: [
                                        { date: "2021-004", note: "beta 1: Apr 22, 2021\nbeta 2: May 4, 2021\nbeta 3: May 11, 2021\nbeta 4: May 17, 2021\nFinal build: May 24, 2021", },                            
                                        { date: "2021-005", note: "beta 1: May 19, 2021\nbeta 2: Jun 3, 2021\nbeta 3: Jun 14, 2021\nbeta 4: Jun 29, 2021\nbeta 5: Jul 8, 2021\nbeta 6: Jul 13, 2021\nFinal build: Jul 21, 2021" },
                                    ],
                                    className: "release-pair-tight",
                                    securityRow: "2022"
                                }
                            ],
                        },
                    };
            
                    const versionSelect = document.getElementById("software-version");
                    const releaseGrid = document.getElementById("release-grid");
                    const timelinePickerNote = document.getElementById("timeline-picker-note");
                    const timelineIntro = document.getElementById("timeline-intro-mac");
                    const timelineFootnote = document.getElementById("timeline-footnote");
                    const defaultPickerNote = "macOS 10.14 also known as macOS Mojave";
            
                    function releaseMarkup(release) {
                        if (release.mainLabel) {
                            return `<p class="section-label span-two">${release.mainLabel}</p>`;
                        }
            
                        if (release.supplementalLabel) {
                            return `<p class="section-label section-label-divider span-two">${release.supplementalLabel}</p>`;
                        }
            
                        if (release.sectionLabel) {
                            return `<p class="section-label section-label-divider span-two">${release.sectionLabel}</p>`;
                        }
            
                        if (release.trio) {
                            const className = release.className ? ` ${release.className}` : "";
                            return `<div class="release-trio${className}">${release.trio.map(releaseMarkup).join("")}</div>`;
                        }
            
                        if (release.quad) {
                            const className = release.className ? " " + release.className : "";
                            return `<div class="release-quad${className}">${release.quad.map(releaseMarkup).join("")}</div>`;
                        }
                        if (release.pair) {
                            const className = release.className ? ` ${release.className}` : "";
                            return `<div class="release-pair${className}">${release.pair.map(releaseMarkup).join("")}</div>`;
                        }
            
                        const spanClass = release.spanTwo ? " span-two" : "";
                        const alignmentClass = release.alignment ? ` release-align-${release.alignment}` : "";
                        const name = release.name ? `<p class="release-name">${release.name}</p>` : "";
                        const note = release.note ? `<p class="release-note">${release.note}</p>` : "";
                        return `<article class="release${spanClass}${alignmentClass}">
                            ${name}
                            <p class="release-date">${release.date}</p>${note}
                        </article>`;
                    }
            
                    function sectionedReleasesMarkup(releases) {
                        const sections = [{ width: "standard", layout: "default", releases: [] }];
            
                        releases.forEach((release) => {
                            if (release.sectionWidth === "wide" && sections.at(-1).releases.length) {
                                sections.push({
                                    width: "wide",
                                    layout: release.sectionLayout ?? "default",
                                    releases: []
                                });
                            }
                            sections.at(-1).releases.push(release);
                        });
            
                        return sections.map((section) => {
                            const widthClass = section.width === "wide" ? " release-section-wide" : "";
                            if (section.layout === "security-grid") {
                                const flatten = (release) => {
                                    if (release.pair) return release.pair.flatMap(flatten);
                                    if (release.trio) return release.trio.flatMap(flatten);
                                    if (release.quad) return release.quad.flatMap(flatten);
                                    return [release];
                                };
                                const desktopRows = [];
            
                                section.releases.forEach((release) => {
                                    if (release.sectionLabel) {
                                        desktopRows.push({ label: release });
                                        return;
                                    }
            
                                    const previousRow = desktopRows.at(-1);
                                    if (release.securityRow && previousRow?.key === release.securityRow) {
                                        previousRow.releases.push(release);
                                        return;
                                    }
            
                                    desktopRows.push({ key: release.securityRow, releases: [release] });
                                });
            
                                const desktopMarkup = desktopRows.map((row) => {
                                    if (row.label) return releaseMarkup(row.label);
                                    const rowReleases = row.releases.flatMap(flatten);
                                    return `<div class="security-update-row security-update-row--${rowReleases.length}">
                                        ${rowReleases.map(releaseMarkup).join("")}
                                    </div>`;
                                }).join("");
                                const mobileMarkup = section.releases.map((release) => {
                                    if (release.sectionLabel) return releaseMarkup(release);
                                    const releases = flatten(release);
                                    return releases.reduce((rows, release, index) => {
                                        if (index % 3 === 0) rows.push([]);
                                        rows.at(-1).push(release);
                                        return rows;
                                    }, []).map((row) => `<div class="security-update-mobile-row security-update-mobile-row--${row.length}">
                                        ${row.map(releaseMarkup).join("")}
                                    </div>`).join("");
                                }).join("");
                                return `<section class="release-section${widthClass}">
                                    <div class="security-update-desktop span-two">
                                        ${desktopMarkup}
                                    </div>
                                    <div class="security-update-mobile">${mobileMarkup}</div>
                                </section>`;
                            }
                            return `<section class="release-section${widthClass}">
                                ${section.releases.map(releaseMarkup).join("")}
                            </section>`;
                        }).join("");
                    }
            
                    function renderTimeline() {
                        const timeline = timelines[versionSelect.value];
            
                        if (!timeline) {
                            releaseGrid.setAttribute("aria-label", "Timeline coming soon");
                            releaseGrid.innerHTML = '<p class="timeline-message span-two">This timeline is coming soon</p>';
                            timelineIntro.hidden = true;
                            timelineIntro.textContent = "";
                            timelineIntro.classList.remove("timeline-intro-after-supplemental");
                            timelineFootnote.hidden = true;
                            timelineFootnote.textContent = "";
                            return;
                        }
            
                        releaseGrid.setAttribute("aria-label", `${timeline.label} release dates`);
                        timelinePickerNote.textContent = timeline.pickerNote ?? defaultPickerNote;
                        timelineIntro.textContent = timeline.intro ?? "";
                        timelineIntro.hidden = !timeline.intro;
                        timelineIntro.classList.toggle(
                        "timeline-intro-after-supplemental",
                        Boolean(timeline.supplemental?.length)
                        );
                        timelineFootnote.textContent = timeline.footnote ?? "";
                        timelineFootnote.hidden = !timeline.footnote;
                        if (timeline.gridMaxWidth) {
                            releaseGrid.style.setProperty("--timeline-grid-max-width", timeline.gridMaxWidth);
                        } else {
                            releaseGrid.style.removeProperty("--timeline-grid-max-width");
                        }
                        let markup = timeline.mainLabel
                            ? `<p class="section-label span-two">${timeline.mainLabel}</p>`
                            : "";
                        markup += timeline.sectionedLayout
                            ? sectionedReleasesMarkup(timeline.releases)
                            : timeline.releases.map(releaseMarkup).join("");
            
                        if (timeline.supplemental?.length) {
                            markup += `<section class="span-two supplemental" aria-label="Supplemental Updates">
                                <p class="section-label">${timeline.supplementalLabel ?? "Supplemental Updates"}</p>
                                ${timeline.supplemental.map(releaseMarkup).join("")}
                            </section>`;
                        }
            
                        releaseGrid.innerHTML = markup;
                    }
            
                    versionSelect.addEventListener("change", renderTimeline);
                    renderTimeline();
        },
        "macos-10-15.html": () => {
            const timelines = {
                        "10-15": {
                            label: "macOS 10.15",
                            gridMaxWidth: "750px",
                            releases: [
                                { name: "macOS 10.15 beta 1", date: "June 3, 2019", alignment: "left" },
                                { name: "macOS 10.15 beta 2", date: "June 17, 2019", note: "build 2: June 24, 2019", alignment: "right" },
                                { name: "macOS 10.15 beta 3", date: "July 2, 2019", alignment: "left" },
                                { name: "macOS 10.15 beta 4", date: "July 16, 2019", alignment: "right" },
                                { name: "macOS 10.15 beta 5", date: "July 31, 2019", alignment: "left" },
                                { name: "macOS 10.15 beta 6", date: "August 19, 2019", alignment: "right" },
                                { name: "macOS 10.15 beta 7", date: "August 28, 2019", alignment: "left" },
                                { name: "macOS 10.15 beta 8", date: "September 10, 2019", alignment: "right" },
                                { name: "macOS 10.15 beta 9", date: "September 23, 2019", alignment: "left" },
                                { name: "macOS 10.15 beta 10", date: "September 30, 2019", alignment: "right" },
                                {
                                    pair: [
                                        { name: "macOS 10.15 GM build", date: "October 3, 2019" },
                                        { name: "macOS 10.15 final build", date: "October 7, 2019" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "macOS 10.15 Supplemental Update", date: "October 15, 2019", note: "build 2: October 21, 2019" }
                            ]
                        },
                        "10-15-1": {
                            label: "macOS 10.15.1",
                            gridMaxWidth: "750px",
                            releases: [
                                { name: "macOS 10.15.1 beta 1", date: "October 10, 2019", alignment: "left" },
                                { name: "macOS 10.15.1 beta 2", date: "October 16, 2019", alignment: "right" },
                                { name: "macOS 10.15.1 beta 3", date: "October 23, 2019", spanTwo: true },
                                { name: "macOS 10.15.1 final build", date: "October 29, 2019", spanTwo: true }
                            ],
                            supplemental: [
                                { name: "macOS 10.15.1 Supplemental Update", date: "November 13, 2019" }
                            ]
                        },
                        "10-15-2": {
                            label: "macOS 10.15.2",
                            gridMaxWidth: "750px",
                            releases: [
                                { name: "macOS 10.15.2 beta 1", date: "November 7, 2019", alignment: "left" },
                                { name: "macOS 10.15.2 beta 2", date: "November 13, 2019", alignment: "right" },
                                { name: "macOS 10.15.2 beta 3", date: "November 20, 2019", alignment: "left" },
                                { name: "macOS 10.15.2 beta 4", date: "December 6, 2019", alignment: "right" },
                                { name: "macoS 10.15.2 final builds", date: "December 10, 2019", spanTwo: true }
                            ],
                        },
                        "10-15-3": {
                            label: "macOS 10.15.3",
                            gridMaxWidth: "750px",
                            releases: [
                                { name: "macOS 10.15.3 beta 1", date: "December 17, 2019", alignment: "left" },
                                { name: "macOS 10.15.3 beta 2", date: "January 14, 2020", alignment: "right" },
                                { name: "macOS 10.15.3 beta 3", date: "January 24, 2020", spanTwo: true },
                                { name: "macOS 10.15.3 final build", date: "January 28, 2020", spanTwo: true }
                            ],
                        },
                        "10-15-4": {
                            label: "macOS 10.15.4",
                            gridMaxWidth: "750px",
                            releases: [
                                { name: "macOS 10.15.4 beta 1", date: "February 5, 2020", alignment: "left" },
                                { name: "macOS 10.15.4 beta 2", date: "February 19, 2020", alignment: "right" },
                                { name: "macOS 10.15.4 beta 3", date: "February 26, 2020", alignment: "left" },
                                { name: "macOS 10.15.4 beta 4", date: "March 3, 2020", alignment: "right" },
                                { name: "macOS 10.15.4 beta 5", date: "March 10, 2020", alignment: "left" },
                                { name: "macOS 10.15.4 beta 6", date: "March 18, 2020", alignment: "right" },
                                { name: "macOS 10.15.4 final build", date: "March 24, 2020", spanTwo: true }
                            ],
                            supplemental: [
                                { name: "macOS 10.15.4 Supplemental Update", date: "April 8, 2020" }
                            ]
                        },
                        "10-15-5": {
                            label: "macOS 10.15.5",
                            gridMaxWidth: "750px",
                            releases: [
                                { name: "macOS 10.15.5 beta 1", date: "March 31, 2020", alignment: "left" },
                                { name: "macOS 10.15.5 beta 2", date: "April 16, 2020", alignment: "right" },
                                { name: "macOS 10.15.5 beta 3", date: "April 29, 2020", alignment: "left" },
                                { name: "macOS 10.15.5 beta 4", date: "May 7, 2020", alignment: "right" },
                                { name: "macOS 10.15.5 beta 5", date: "May 18, 2020", spanTwo: true },
                                { name: "macOS 10.15.5 final build", date: "May 26, 2020", spanTwo: true },
            
                            ],
                            supplemental: [
                                { name: "macOS 10.15.5 Supplemental Update", date: "June 1, 2020", note: "build 2: June 15, 2020" }
                            ]
                        },
                        "10-15-6": {
                            label: "macOS 10.15.6",
                            gridMaxWidth: "750px",
                            releases: [
                                { name: "macOS 10.15.6 beta 1", date: "June 1, 2020", alignment: "left" },
                                { name: "macOS 10.15.6 beta 2", date: "June 9, 2020", alignment: "right" },
                                { name: "macOS 10.15.6 beta 3", date: "June 30, 2020", alignment: "left" },
                                { name: "macOS 10.15.6 beta 4", date: "July 9, 2020", alignment: "right" },
                            ],
                            supplemental: [
                                { name: "macOS 10.15.6 Supplemental Update", date: "August 12, 2020", spanTwo: true },
                                { name: "macOS 10.15.6 Supplemental Update 2 beta", date: "September 10, 2020", spanTwo: true },
                            ],
                            intro: "macOS 10.15.6 Supplemental Update 2 beta (presumably) continued as macOS 10.15.7.\nFor more information, see macOS 10.15.7.",
                        },
                        "10-15-7": {
                            label: "macOS 10.15.7",
                            footnote: "1: 2021-001 beta 2 continues 2020-002 beta 1.\n2: 2022-001 beta 2 continues 2021-008 beta 1, build 2.\n3: 2022-003 beta 2 continues 2022-002.",
                            gridMaxWidth: "1550px",
                            sectionedLayout: true,
                            releases: [
                                { mainLabel: "Main Update" },
                                { name: "macOS 10.15.7 build 1", date: "September 24, 2020", alignment: "left" },
                                { name: "macOS 10.15.7 build 2", date: "October 27, 2020", alignment: "right" },
                                { supplementalLabel: "Supplemental Updates" },
                                { name: "macOS 10.15.7 Supplemental Update 1", date: "November 5, 2020", alignment: "left" },
                                { name: "macOS 10.15.7 Supplemental Update 2", date: "February 9, 2021", alignment: "right" },
                                { 
                                    sectionLabel: "Security Updates",
                                    sectionWidth: "wide",
                                    sectionLayout: "security-grid",
                                },
                                { 
                                    pair: [
                                        { date: "2020-001", note: "beta 1: Nov 19, 2020\nbeta 2: Dec 3, 2020\nFinal build: Dec 14, 2020" },
                                        { date: "2020-002", note: "beta 1: Dec 16, 2020" },
                                ],
                                className: "release-pair-tight"
                                },
                                { 
                                    quad: [
                                        { date: "2021-001", note: "beta 2&#185;: Jan 13, 2021\nbeta 3: Jan 22, 2021\nFinal build: Feb 1, 2021" },
                                        { date: "2021-002", note: "beta 1: Feb 9, 2021\nbeta 2: Feb 17, 2021\nbeta 3: Mar 2, 2021\nbeta 4: Mar 16, 2021\nbeta 5: Mar 23, 2021\nbeta 6: Apr 14, 2021\nbeta 7: Apr 20, 2021\nFinal build: Apr 26, 2021" },
                                        { date: "2021-003", note: "beta 1: Apr 21, 2021\nbeta 2: May 4, 2021\nbeta 3: May 10, 2021\nbeta 4: May 14, 2021\nbeta 5: May 17, 2021\nFinal build: May 24, 2021", },
                                        { date: "2021-004", note: "beta 1: May 19, 2021\nbeta 2: Jun 3, 2021\nbeta 3: Jun 14, 2021\nbeta 4: Jun 29, 2021\nbeta 5: Jul 8, 2021\nbeta 6: Jul 13, 2021\nFinal build: Jul 21, 2021" },
                                ],
                                className: "release-quad-tight",
                                securityRow: "2021"
                                },
                                {
                                    quad: [
                                        { date: "2021-005", note: "Final build: Sep 13, 2021" },
                                        { date: "2021-006", note: "Final build: Sep 23, 2021" },
                                        { date: "2021-007", note: "beta 1: Sep 30, 2021\nbeta 2: Oct 6, 2021\nbeta 3: Oct 13, 2021\nbeta 4: Oct 18, 2021\nFinal build: Oct 25, 2021" },
                                        { date: "2021-008", note: "beta 1: Nov 9, 2021\nbeta 2: Nov 16, 2021\nbeta 3: Dec 1, 2021\nbeta 4: Dec 7, 2021\nFinal build: Dec 13, 2021\nbeta 1, build 2: Dec 16, 2021" },
                                    ],
                                    className: "release-quad-tight",
                                    securityRow: "2021"
                                },
                                {
                                    trio: [
                                        { date: "2022-001", note: "beta 2&#178;: Jan 11, 2022\nbeta 3: Jan 20, 2022\nFinal build: Jan 26, 2022" },
                                        { date: "2022-002", note: "beta 1: Jan 27, 2022\nFinal build: Feb 14, 2022" },
                                        { date: "2022-003", note: "beta 2&#179;: Feb 15, 2022\nbeta 3: Feb 22, 2022\nbeta 4: Mar 1, 2022\nbeta 5: Mar 8, 2022\nFinal build: Mar 14, 2022" }
                                    ],
                                    className: "release-trio-tight",
                                    securityRow: "2022"
                                },
                                {
                                    pair: [
                                        { date: "2022-004", note: "beta 1: Apr 5, 2022\nbeta 2: Apr 19, 2022\nbeta 3: Apr 26, 2022\nbeta 4: May 3, 2022\nbeta 5: May 12, 2022\nFinal build: May 16, 2022" },
                                        { date: "2022-005", note: "beta 1: May 18, 2022\nbeta 2: May 31, 2022\nbeta 3: Jun 14, 2022\nbeta 4: Jun 24, 2022\nbeta 5: Jul 5, 2022\nbeta 6: Jul 12, 2022\nFinal build: Jul 20, 2022" },
                                    ],
                                    className: "release-pair-tight",
                                    securityRow: "2022"
                                }
                            ],
                        },
                        "10-15-8": {
                            label: "macOS 10.15.8",
                            pickerNote: "Security Updates • macOS 10.15 also known as macOS Catalina",
                            releases: [
                                { date: "2026-001", note: "Final build: Feb 2, 2026", spanTwo: true }
                            ],
                        },
                    };
            
                    const versionSelect = document.getElementById("software-version");
                    const releaseGrid = document.getElementById("release-grid");
                    const timelinePickerNote = document.getElementById("timeline-picker-note");
                    const timelineIntro = document.getElementById("timeline-intro-mac");
                    const timelineFootnote = document.getElementById("timeline-footnote");
                    const defaultPickerNote = "macOS 10.15 also known as macOS Catalina";
            
                    function releaseMarkup(release) {
                        if (release.mainLabel) {
                            return `<p class="section-label span-two">${release.mainLabel}</p>`;
                        }
            
                        if (release.supplementalLabel) {
                            return `<p class="section-label section-label-divider span-two">${release.supplementalLabel}</p>`;
                        }
            
                        if (release.sectionLabel) {
                            return `<p class="section-label section-label-divider span-two">${release.sectionLabel}</p>`;
                        }
            
                        if (release.trio) {
                            const className = release.className ? ` ${release.className}` : "";
                            return `<div class="release-trio${className}">${release.trio.map(releaseMarkup).join("")}</div>`;
                        }
            
                        if (release.quad) {
                            const className = release.className ? " " + release.className : "";
                            return `<div class="release-quad${className}">${release.quad.map(releaseMarkup).join("")}</div>`;
                        }
                        if (release.pair) {
                            const className = release.className ? ` ${release.className}` : "";
                            return `<div class="release-pair${className}">${release.pair.map(releaseMarkup).join("")}</div>`;
                        }
            
                        const spanClass = release.spanTwo ? " span-two" : "";
                        const alignmentClass = release.alignment ? ` release-align-${release.alignment}` : "";
                        const name = release.name ? `<p class="release-name">${release.name}</p>` : "";
                        const note = release.note ? `<p class="release-note">${release.note}</p>` : "";
                        return `<article class="release${spanClass}${alignmentClass}">
                            ${name}
                            <p class="release-date">${release.date}</p>${note}
                        </article>`;
                    }
            
                    function sectionedReleasesMarkup(releases) {
                        const sections = [{ width: "standard", layout: "default", releases: [] }];
            
                        releases.forEach((release) => {
                            if (release.sectionWidth === "wide" && sections.at(-1).releases.length) {
                                sections.push({
                                    width: "wide",
                                    layout: release.sectionLayout ?? "default",
                                    releases: []
                                });
                            }
                            sections.at(-1).releases.push(release);
                        });
            
                        return sections.map((section) => {
                            const widthClass = section.width === "wide" ? " release-section-wide" : "";
                            if (section.layout === "security-grid") {
                                const flatten = (release) => {
                                    if (release.pair) return release.pair.flatMap(flatten);
                                    if (release.trio) return release.trio.flatMap(flatten);
                                    if (release.quad) return release.quad.flatMap(flatten);
                                    return [release];
                                };
                                const desktopRows = [];
            
                                section.releases.forEach((release) => {
                                    if (release.sectionLabel) {
                                        desktopRows.push({ label: release });
                                        return;
                                    }
            
                                    const previousRow = desktopRows.at(-1);
                                    if (release.securityRow && previousRow?.key === release.securityRow) {
                                        previousRow.releases.push(release);
                                        return;
                                    }
            
                                    desktopRows.push({ key: release.securityRow, releases: [release] });
                                });
            
                                const desktopMarkup = desktopRows.map((row) => {
                                    if (row.label) return releaseMarkup(row.label);
                                    const rowReleases = row.releases.flatMap(flatten);
                                    return `<div class="security-update-row security-update-row--${rowReleases.length}">
                                        ${rowReleases.map(releaseMarkup).join("")}
                                    </div>`;
                                }).join("");
                                const mobileMarkup = section.releases.map((release) => {
                                    if (release.sectionLabel) return releaseMarkup(release);
                                    const releases = flatten(release);
                                    return releases.reduce((rows, release, index) => {
                                        if (index % 3 === 0) rows.push([]);
                                        rows.at(-1).push(release);
                                        return rows;
                                    }, []).map((row) => `<div class="security-update-mobile-row security-update-mobile-row--${row.length}">
                                        ${row.map(releaseMarkup).join("")}
                                    </div>`).join("");
                                }).join("");
                                return `<section class="release-section${widthClass}">
                                    <div class="security-update-desktop span-two">
                                        ${desktopMarkup}
                                    </div>
                                    <div class="security-update-mobile">${mobileMarkup}</div>
                                </section>`;
                            }
                            return `<section class="release-section${widthClass}">
                                ${section.releases.map(releaseMarkup).join("")}
                            </section>`;
                        }).join("");
                    }
            
                    function renderTimeline() {
                        const timeline = timelines[versionSelect.value];
            
                        if (!timeline) {
                            releaseGrid.setAttribute("aria-label", "Timeline coming soon");
                            releaseGrid.innerHTML = '<p class="timeline-message span-two">This timeline is coming soon</p>';
                            timelineIntro.hidden = true;
                            timelineIntro.textContent = "";
                            timelineIntro.classList.remove("timeline-intro-after-supplemental");
                            timelineFootnote.hidden = true;
                            timelineFootnote.textContent = "";
                            return;
                        }
            
                        releaseGrid.setAttribute("aria-label", `${timeline.label} release dates`);
                        timelinePickerNote.textContent = timeline.pickerNote ?? defaultPickerNote;
                        timelineIntro.textContent = timeline.intro ?? "";
                        timelineIntro.hidden = !timeline.intro;
                        timelineIntro.classList.toggle(
                        "timeline-intro-after-supplemental",
                        Boolean(timeline.supplemental?.length)
                        );
                        timelineFootnote.textContent = timeline.footnote ?? "";
                        timelineFootnote.hidden = !timeline.footnote;
                        if (timeline.gridMaxWidth) {
                            releaseGrid.style.setProperty("--timeline-grid-max-width", timeline.gridMaxWidth);
                        } else {
                            releaseGrid.style.removeProperty("--timeline-grid-max-width");
                        }
                        let markup = timeline.mainLabel
                            ? `<p class="section-label span-two">${timeline.mainLabel}</p>`
                            : "";
                        markup += timeline.sectionedLayout
                            ? sectionedReleasesMarkup(timeline.releases)
                            : timeline.releases.map(releaseMarkup).join("");
            
                        if (timeline.supplemental?.length) {
                            markup += `<section class="span-two supplemental" aria-label="Supplemental Updates">
                                <p class="section-label">${timeline.supplementalLabel ?? "Supplemental Updates"}</p>
                                ${timeline.supplemental.map(releaseMarkup).join("")}
                            </section>`;
                        }
            
                        releaseGrid.innerHTML = markup;
                    }
            
                    versionSelect.addEventListener("change", renderTimeline);
                    renderTimeline();
        },
        "macos-11.html": () => {
            const timelines = {
                        "11-0": {
                            label: "macOS 11.0",
                            gridMaxWidth: "750px",
                            releases: [
                                { name: "macOS 11.0 beta 1", date: "June 22, 2020", alignment: "left" },
                                { name: "macOS 11.0 beta 2", date: "July 7, 2020", alignment: "right" },
                                { name: "macOS 11.0 beta 3", date: "July 22, 2020", alignment: "left" },
                                { name: "macOS 11.0 beta 4", date: "August 4, 2020", note: "build 2: August 6, 2020", alignment: "right" },
                                { name: "macOS 11.0 beta 5", date: "August 19, 2020", alignment: "left" },
                                { name: "macOS 11.0 beta 6", date: "September 8, 2020", alignment: "right" },
                                { name: "macOS 11.0 beta 7", date: "September 17, 2020", alignment: "left" },
                                { name: "macOS 11.0 beta 8", date: "September 22, 2020", alignment: "right" },
                                { name: "macOS 11.0 beta 9", date: "September 29, 2020", alignment: "left" },
                                { name: "macOS 11.0 beta 10", date: "October 14, 2020", alignment: "right" },
                                { name: "macOS 11.0 final build", date: "November 10, 2020", spanTwo: true },
                            ],
                            intro: "macOS 11.0 released as preinstalled firmware for Macs with M1.\nmacOS 11.0.1 released for all other Macs on November 12, 2020.\nApple advised owners of Macs with M1 (released November 17, 2020) to update to macOS 11.0.1.",
                        },
                        "11-0-1": {
                            label: "macOS 11.0.1",
                            gridMaxWidth: "750px",
                            releases: [
                                { name: "macOS 11.0.1 beta 1", date: "October 28, 2020", spanTwo: true },
                                {
                                    pair: [
                                        { name: "macOS 11.0.1 RC build", date: "November 5, 2020", note: "build 2: November 10, 2020" },
                                        { name: "macOS 11.0.1 final build", date: "November 12, 2020" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            intro: "macOS 11.0 released as preinstalled firmware for Macs with M1.\nmacOS 11.0.1 released for all other Macs on November 12, 2020.\nApple advised owners of Macs with M1 (released November 17, 2020) to update to macOS 11.0.1.",
                        },
                        "11-1": {
                            label: "macOS 11.1",
                            gridMaxWidth: "750px",
                            releases: [
                                { name: "macOS 11.1 beta 1", date: "November 17, 2020", note: "build 2: November 20, 2020", alignment: "left" },
                                { name: "macOS 11.1 beta 2", date: "December 3, 2020", alignment: "right" },
                                {
                                    pair: [
                                        { name: "macOS 11.1 RC build", date: "December 10, 2020" },
                                        { name: "macOS 11.1 final build", date: "December 14, 2020" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "11-2": {
                            label: "macOS 11.2",
                            gridMaxWidth: "750px",
                            releases: [
                                { name: "macOS 11.2 beta 1", date: "December 16, 2020", alignment: "left" },
                                { name: "macOS 11.2 beta 2", date: "January 13, 2021", alignment: "right" },
                                {
                                    pair: [
                                        { name: "macOS 11.2 RC build", date: "January 21, 2021", note: "build 2: January 25, 2021\nbuild 3: January 28, 2021" },
                                        { name: "macOS 11.2 final build", date: "February 1, 2021" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { trio: [
                                        { name: "macOS 11.2.1", date: "February 9, 2021", note: "build 2: February 15, 2021" },
                                        { name: "macOS 11.2.2", date: "February 25, 2021" },
                                        { name: "macOS 11.2.3", date: "March 3, 2021" },
                                    ],
                                    className: "release-trio-tight" }
                            ]
                        },
                        "11-3": {
                            label: "macOS 11.3",
                            gridMaxWidth: "750px",
                            releases: [
                                { name: "macOS 11.3 beta 1", date: "February 2, 2021", alignment: "left" },
                                { name: "macOS 11.3 beta 2", date: "February 17, 2021", alignment: "right" },
                                { name: "macOS 11.3 beta 3", date: "March 2, 2021", alignment: "left" },
                                { name: "macOS 11.3 beta 4", date: "March 15, 2021", alignment: "right" },
                                { name: "macOS 11.3 beta 5", date: "March 23, 2021", alignment: "left" },
                                { name: "macOS 11.3 beta 6", date: "March 31, 2021", alignment: "right" },
                                { name: "macOS 11.3 beta 7", date: "April 7, 2021", alignment: "left" },
                                { name: "macOS 11.3 beta 8", date: "April 13, 2021", alignment: "right" },
                                {
                                    pair: [
                                        { name: "macOS 11.3 RC build", date: "April 20, 2021" },
                                        { name: "macOS 11.3 final build", date: "April 26, 2021" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "macOS 11.3.1", date: "May 3, 2021" }
                            ]
                        },
                        "11-4": {
                            label: "macOS 11.4",
                            gridMaxWidth: "750px",
                            releases: [
                                { name: "macOS 11.4 beta 1", date: "April 21, 2021", alignment: "left" },
                                { name: "macOS 11.4 beta 2", date: "May 4, 2021", alignment: "right" },
                                { name: "macOS 11.4 beta 3", date: "May 10, 2021", spanTwo: true },
                                {
                                    pair: [
                                        { name: "macOS 11.4 RC build", date: "May 17, 2021" },
                                        { name: "macOS 11.4 final build", date: "May 24, 2021" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "11-5": {
                            label: "macOS 11.5",
                            gridMaxWidth: "750px",
                            releases: [
                                { name: "macOS 11.5 beta 1", date: "May 19, 2021", alignment: "left" },
                                { name: "macOS 11.5 beta 2", date: "June 2, 2021", alignment: "right" },
                                { name: "macOS 11.5 beta 3", date: "June 14, 2021", alignment: "left" },
                                { name: "macOS 11.5 beta 4", date: "June 29, 2021", alignment: "right" },
                                { name: "macOS 11.5 beta 5", date: "July 8, 2021", spanTwo: true },
                                {
                                    pair: [
                                        { name: "macOS 11.5 RC build", date: "July 13, 2021", note: "July 19, 2021" },
                                        { name: "macOS 11.5 final build", date: "July 21, 2021" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "macOS 11.5.1", date: "July 26, 2021" },
                                { name: "macOS 11.5.2", date: "August 11, 2021" },
                            ]
                        },
                        "11-6-x": {
                            label: "macOS 11.6.x",
                            gridMaxWidth: "950px",
                            releases: [
                                {
                                    quad: [
                                        { date: "macOS 11.6", note: "Final build: Sep 13, 2021" },
                                        { date: "macOS 11.6.1", note: "RC build 1: Sep 29, 2021\nRC build 2: Oct 6, 2021\nRC build 3: Oct 13, 2021\nRC build 4: Oct 18, 2021\nFinal build: Oct 25, 2021" },
                                        { date: "macOS 11.6.2", note: "RC build 1: Nov 9, 2021\nRC build 2: Nov 16, 2021\nRC build 3: Dec 1, 2021\nRC build 4: Dec 7, 2021\nFinal build: Dec 13, 2021"},
                                        { date: "macOS 11.6.3", note: "RC build 1: Dec 16, 2021\nRC build 2: Jan 11, 2022\nRC build 3: Jan 20, 2022\nFinal build: Jan 26, 2022" }
                                    ],
                                    className: "release-quad-tight"
                                },
                                {
                                    trio: [
                                        { date: "macOS 11.6.4", note: "RC build: Jan 27, 2022\nFinal build: Feb 4, 2022" },
                                        { date: "macOS 11.6.5", note: "RC build 1: Feb 15, 2022\nRC build 2: Feb 22, 2022\nRC build 3: Mar 1, 2022\nRC build 4: Mar 8, 2022\nFInal build: Mar 14, 2022" },
                                        { date: "macOS 11.6.6", note: "RC build 1: Apr 5, 2022\nRC build 2: Apr 19, 2022\nRC build 3: Apr 26, 2022\nRC build 4: May 3, 2022\nRC build 5: May 12, 2022\nFinal build: May 16, 2022" },
                                    ],
                                    className: "release-trio-tight"
                                },
                                {
                                    pair: [
                                        { date: "macOS 11.6.7", note: "RC build 1: May 18, 2022\nRC build 2: May 31, 2022\nFinal build: Jun 9, 2022"},                            
                                        { date: "macOS 11.6.8", note: "RC build 1: Jun 14, 2022\nRC build 2: Jun 24, 2022\nRC build 3: Jul 5, 2022\nRC build 4: Jul 12, 2022\nFinal build: Jul 20, 2022" },
                                    ],
                                    className: "release-pair-tight"
                                },
                            ]
                        },  
                        "11-7-x": {
                            label: "macOS 11.7.x",
                            gridMaxWidth: "950px",
                            releases: [
                                {
                                    quad: [
                                        { date: "macOS 11.7", note: "RC build: Sep 7, 2022\nFinal build: Sep 12, 2022" },
                                        { date: "macOS 11.7.1", note: "RC build 1: Sep 28, 2022\nRC build 2: Oct 4, 2022\nRC build 3: Oct 11, 2022\nRC build 4: Oct 18, 2022\nFinal build: Oct 27, 2022" },
                                        { date: "macOS 11.7.2", note: "RC build 1: Nov 8, 2022\nRC build 2: Nov 15, 2022\nRC build 3: Dec 7, 2022\nFinal build: Dec 13, 2022"},
                                        { date: "macOS 11.7.3", note: "RC build 1: Dec 14, 2022\nRC build 2: Jan 10, 2023\nRC build 3: Jan 18, 2023\nFinal build: Jan 23, 2023" }
                                    ],
                                    className: "release-quad-tight"
                                },
                                {
                                    trio: [
                                        { date: "macOS 11.7.4", note: "Final build: Feb 15, 2023" },
                                        { date: "macOS 11.7.5", note: "RC build 1: Feb 16, 2023\nRC build 2: Feb 28, 2023\nRC build 3: Mar 7, 2023\nRC build 4: Mar 15, 2023\nRC build 5: Mar 21, 2023\nFInal build: Mar 27, 2023" },
                                        { date: "macOS 11.7.6", note: "RC build: Mar 29, 2023\nFinal build: Apr 10, 2023" },
                                    ],
                                    className: "release-trio-tight"
                                },
                                {
                                    trio: [
                                        { date: "macOS 11.7.7", note: "RC build 1: Apr 11, 2023\nRC build 2: Apr 25, 2023\nRC build 3: May 2, 2023\nRC build 4: May 9, 2023\nFinal build: May 18, 2023"},                            
                                        { date: "macOS 11.7.8", note: "RC build 1: May 19, 2023\nRC build 2: May 31, 2023\nFinal build: Jun 21, 2023" },
                                        { date: "macOS 11.7.9", note: "RC build 1: Jun 15, 2023\nRC build 2: Jun 27, 2023\nRC build 3: Jul 10, 2023\nRC build 4: Jul 18, 2023\nFinal build: Jul 24, 2023" },
                                    ],
                                    className: "release-trio-tight"
                                },
                                {
                                    pair: [
                                        { date: "macOS 11.7.10", note: "Final build: Sep 11, 2023" },
                                        { date: "macOS 11.7.11", note: "Final build: Feb 2, 2026" },
                                    ],
                                    className: "release-pair-tight"
                                },
                            ]
                        },            
                    };
            initializeTimelinePage(timelines);
        },
        "macos-12.html": () => {
            const timelines = {
                        "12-0": {
                            label: "macOS 12.0",
                            gridMaxWidth: "750px",
                            releases: [
                                { name: "macOS 12.0 beta 1", date: "June 7, 2021", alignment: "left" },
                                { name: "macOS 12.0 beta 2", date: "June 28, 2021", alignment: "right" },
                                { name: "macOS 12.0 beta 3", date: "July 14, 2021", alignment: "left" },
                                { name: "macOS 12.0 beta 4", date: "July 27, 2021", alignment: "right" },
                                { name: "macOS 12.0 beta 5", date: "August 11, 2021", alignment: "left" },
                                { name: "macOS 12.0 beta 6", date: "August 30, 2021", alignment: "right" },
                                { name: "macOS 12.0 beta 7", date: "September 21, 2021", alignment: "left" },
                                { name: "macOS 12.0 beta 8", date: "September 28, 2021", alignment: "right" },
                                { name: "macOS 12.0 beta 9", date: "October 6, 2021", alignment: "left" },
                                { name: "macOS 12.0 beta 10", date: "October 13, 2021", alignment: "right" },
                                { name: "macOS 12.0 final build", date: "October 18, 2021", spanTwo: true },
                            ],
                            supplemental: [
                                { date: "macOS 12.0.1", note: "RC build 1: Oct 18, 2021\nRC build 2: Oct 21, 2021\nFinal build: Oct 25, 2021" },
                            ],
                            intro: "macOS 12.0 released on October 18, 2021 as preinstalled firmware for MacBook Pro models with M1 Pro and M1 Max.\nmacOS 12.0.1 released for all other supported Macs on October 25, 2021.\nApple advised owners of MacBook Pro models with M1 Pro and M1 Max (released October 26, 2021) to update to macOS 12.0.1."
                        },
                        "12-1": {
                            label: "macOS 12.1",
                            gridMaxWidth: "750px",
                            releases: [
                                { name: "macOS 12.1 beta 1", date: "October 28, 2021", alignment: "left" },
                                { name: "macOS 12.1 beta 2", date: "November 9, 2021", alignment: "right" },
                                { name: "macOS 12.1 beta 3", date: "November 16, 2021", alignment: "left" },
                                { name: "macOS 12.1 beta 4", date: "December 1, 2021", alignment: "right" },
                                {
                                    pair: [
                                        { name: "macOS 12.1 RC build", date: "December 7, 2021", note: "build 2: December 10, 2021" },
                                        { name: "macOS 12.1 final build", date: "December 13, 2021" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "12-2": {
                            label: "macOS 12.2",
                            gridMaxWidth: "750px",
                            releases: [
                                { name: "macOS 12.2 beta 1", date: "December 17, 2021", alignment: "left" },
                                { name: "macOS 12.2 beta 2", date: "January 11, 2022", alignment: "right" },
                                {
                                    pair: [
                                        { name: "macOS 12.2 RC build", date: "January 20, 2022" },
                                        { name: "macOS 12.2 final build", date: "January 26, 2022" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "macOS 15.2.1", date: "February 10, 2022" }
                            ]
                        },
                        "12-3": {
                            label: "macOS 12.3",
                            gridMaxWidth: "750px",
                            releases: [
                                { name: "macOS 12.3 beta 1", date: "January 27, 2022", alignment: "left" },
                                { name: "macOS 12.3 beta 2", date: "February 8, 2022", alignment: "right" },
                                { name: "macOS 12.3 beta 3", date: "February 15, 2022", alignment: "left" },
                                { name: "macOS 12.3 beta 4", date: "February 22, 2022", alignment: "right" },
                                { name: "macOS 12.3 beta 5", date: "March 1, 2022", spanTwo: true },
                                {
                                    pair: [
                                        { name: "macOS 12.3 RC build", date: "March 8, 2022" },
                                        { name: "macOS 12.3 final build", date: "March 14, 2022" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "macOS 12.3.1", date: "March 31, 2022" }
                            ]
                        },
                        "12-4": {
                            label: "macOS 12.4",
                            gridMaxWidth: "750px",
                            releases: [
                                { name: "macOS 12.4 beta 1", date: "April 5, 2022", alignment: "left" },
                                { name: "macOS 12.4 beta 2", date: "April 19, 2022", alignment: "right" },
                                { name: "macOS 12.4 beta 3", date: "April 26, 2022", alignment: "left" },
                                { name: "macOS 12.4 beta 4", date: "May 3, 2022", alignment: "right" },
                                {
                                    pair: [
                                        { name: "macOS 12.4 RC build", date: "May 12, 2022" },
                                        { name: "macOS 12.4 final build", date: "May 16, 2022" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "12-5": {
                            label: "macOS 12.5",
                            gridMaxWidth: "750px",
                            releases: [
                                { name: "macOS 12.5 beta 1", date: "May 18, 2022", alignment: "left" },
                                { name: "macOS 12.5 beta 2", date: "May 31, 2022", alignment: "right" },
                                { name: "macOS 12.5 beta 3", date: "June 14, 2022", alignment: "left" },
                                { name: "macOS 12.5 beta 4", date: "June 24, 2022", alignment: "right" },
                                { name: "macOS 12.5 beta 5", date: "July 5, 2022", spanTwo: true },
                                {
                                    pair: [
                                        { name: "macOS 12.5 RC build", date: "July 12, 2022", note: "build 2: July 18, 2022" },
                                        { name: "macOS 12.5 final build", date: "July 20, 2022" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "macOS 12.5.1", date: "August 17, 2022" }
                            ]
                        },
                        "12-6-x": {
                            label: "macOS 12.6.x",
                            gridMaxWidth: "950px",
                            releases: [
                                {
                                    quad: [
                                        { date: "macOS 12.6", note: "RC build: Sep 7, 2022\nFinal build: Sep 12, 2022" },
                                        { date: "macOS 12.6.1", note: "RC build 1: Sep 27, 2022\nRC build 2: Oct 4, 2022\nRC build 3: Oct 11, 2022\nRC build 4: Oct 18, 2022\nFinal build: Oct 27, 2022" },
                                        { date: "macOS 12.6.2", note: "RC build 1: Nov 8, 2022\nRC build 2: Nov 15, 2022\nRC build 3: Dec 1, 2022\nRC build 4: Dec 7, 2022\nFinal build: Dec 13, 2022"},
                                        { date: "macOS 12.6.3", note: "RC build 1: Dec 14, 2022\nRC build 2: Jan 10, 2023\nRC build 3: Jan 18, 2023\nFinal build: Jan 23, 2023" }
                                    ],
                                    className: "release-quad-tight"
                                },
                                {
                                    trio: [
                                        { date: "macOS 12.6.4", note: "RC build 1: Feb 16, 2023\nRC build 2: Feb 28, 2023\nRC build 3: Mar 7, 2023\nRC build 4: Mar 15, 2023\nRC build 5: Mar 21, 2023\nFInal build: Mar 27, 2023" },
                                        { date: "macOS 12.6.5", note: "RC build: Mar 29, 2023\nFinal build: Apr 10, 2023" },
                                        { date: "macOS 12.6.6", note: "RC build 1: Apr 11, 2023\nRC build 2: Apr 25, 2023\nRC build 3: May 2, 2023\nRC build 4: May 9, 2023\nFinal build: May 18, 2023"},
                                    ],
                                    className: "release-trio-tight"
                                },
                                {
                                    trio: [
                                        { date: "macOS 12.6.7", note: "RC build 1: May 19, 2023\nRC build 2: May 31, 2023\nFinal build: Jun 21, 2023" },
                                        { date: "macOS 12.6.8", note: "RC build 1: Jun 15, 2023\nRC build 2: Jun 27, 2023\nRC build 3: Jul 10, 2023\nRC build 4: Jul 18, 2023\nFinal build: Jul 24, 2023" },
                                        { date: "macOS 12.6.9", note: "Final build: Sep 11, 2023"}
                                    ],
                                    className: "release-trio-tight"
                                },
                            ]
                        },
                        "12-7-x": {
                            label: "macOS 12.7.x",
                            gridMaxWidth: "950px",
                            releases: [
                                {
                                    quad: [
                                        { date: "macOS 12.7", note: "RC build 1: Aug 22, 2023\nRC build 2: Aug 30, 2023\nRC build 3: Sep 12, 2023\nFinal build: Sep 21, 2023" },
                                        { date: "macOS 12.7.1", note: "RC build 1: Oct 3, 2023\nRC build 2: Oct 10, 2023\nRC build 3: Oct 17, 2023\nFinal build: Oct 25, 2023" },
                                        { date: "macOS 12.7.2", note: "RC build: Oct 26, 2023\nRC build 2: Nov 10, 2023\nRC build 3: Nov 14, 2023\nRC build 4: Nov 28, 2023\nRC build 5: Dec 5, 2023\nFinal build: Dec 11, 2023" },
                                        { date: "macOS 12.7.3", note: "RC build 1: Dec 12, 2023\nRC build 2: Jan 3, 2024\nRC build 3: Jan 9, 2024\nRC build 4: Jan 17, 2024\nFinal build: Jan 22, 2024" },
                                    ],
                                    className: "release-quad-tight"
                                },
                                {
                                    trio: [
                                        { date: "macOS 12.7.4", note: "RC build 1: Jan 29, 2024\nRC build 2: Feb 6, 2024\nRC build 3: Feb 22, 2024\nRC build 4: Feb 27, 2024\nRC build 5: Mar 4, 2024\nFinal build: Mar 7, 2024" },
                                        { date: "macOS 12.7.5", note: "RC build 1: Apr 2, 2024\nRC build 2: Apr 16, 2024\nRC build 3: Apr 23, 2024\nRC build 4: Apr 30, 2024\nRC build 5: May 9, 2024\nFinal build: May 13, 2024" },
                                        { date: "macOS 12.7.6", note: "RC build 1: Jun 17, 2024\nRC build 2: Jul 1, 2024\nRC build 3: Jul 9, 2024\nRC build 4: Jul 16, 2024\nRC build 5: Jul 23, 2024\nFinal build: Jul 29, 2024" },
                                    ],
                                    className: "release-trio-tight"
                                },
                            ]
                        },
                    };
            initializeTimelinePage(timelines);
        },
        "macos-13.html": () => {
            const timelines = {
                        "13-0": {
                            label: "macOS 13.0",
                            gridMaxWidth: "750px",
                            releases: [
                                { name: "macOS 13.0 beta 1", date: "June 6, 2022", alignment: "left" },
                                { name: "macOS 13.0 beta 2", date: "June 22, 2022", alignment: "right" },
                                { name: "macOS 13.0 beta 3", date: "July 6, 2022", note: "build 2: July 11, 2022", alignment: "left" },
                                { name: "macOS 13.0 beta 4", date: "July 27, 2022", alignment: "right" },
                                { name: "macOS 13.0 beta 5", date: "August 8, 2022", alignment: "left" },
                                { name: "macOS 13.0 beta 6", date: "August 25, 2022", alignment: "right" },
                                { name: "macOS 13.0 beta 7", date: "September 9, 2022", alignment: "left" },
                                { name: "macOS 13.0 beta 8", date: "September 20, 2022", alignment: "right" },
                                { name: "macOS 13.0 beta 9", date: "September 27, 2022", alignment: "left" },
                                { name: "macOS 13.0 beta 10", date: "October 4, 2022", alignment: "right" },
                                { name: "macOS 13.0 beta 11", date: "October 11, 2022", spanTwo: true },
                                {
                                    pair: [
                                        { name: "macOS 13.0 RC build", date: "October 18, 2022" },
                                        { name: "macOS 13.0 final build", date: "October 24, 2022" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "macOS 13.0.1", date: "November 9, 2022" }
                            ]
                        },
                        "13-1": {
                            label: "macOS 13.1",
                            gridMaxWidth: "750px",
                            releases: [
                                { name: "macOS 13.1 beta 1", date: "October 25, 2022", alignment: "left" },
                                { name: "macOS 13.1 beta 2", date: "November 8, 2022", alignment: "right" },
                                { name: "macOS 13.1 beta 3", date: "November 15, 2022", alignment: "left" },
                                { name: "macOS 13.1 beta 4", date: "December 1, 2022", alignment: "right" },
                                {
                                    pair: [
                                        { name: "macOS 13.1 RC build", date: "December 7, 2022" },
                                        { name: "macOS 13.1 final build", date: "December 13, 2022" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "13-2": {
                            label: "macOS 13.2",
                            gridMaxWidth: "750px",
                            releases: [
                                { name: "macOS 13.2 beta 1", date: "December 14, 2022", alignment: "left" },
                                { name: "macOS 13.2 beta 2", date: "January 10, 2023", alignment: "right" },
                                {
                                    pair: [
                                        { name: "macOS 13.2 RC build", date: "January 18, 2023" },
                                        { name: "macOS 13.2 final build", date: "January 23, 2023" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "macOS 13.2.1", date: "February 13, 2023" }
                            ]
                        },
                        "13-3": {
                            label: "macOS 13.3",
                            gridMaxWidth: "750px",
                            releases: [
                                { name: "macOS 13.3 beta 1", date: "February 16, 2023", alignment: "left" },
                                { name: "macOS 13.3 beta 2", date: "February 28, 2023", alignment: "right" },
                                { name: "macOS 13.3 beta 3", date: "March 7, 2023", alignment: "left" },
                                { name: "macOS 13.3 beta 4", date: "March 15, 2023", alignment: "right" },
                                {
                                    pair: [
                                        { name: "macOS 13.3 RC build", date: "March 21, 2023" },
                                        { name: "macOS 13.3 final build", date: "March 27, 2023" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "macOS 13.3.1", date: "April 7, 2023" }
                            ]
                        },
                        "13-4": {
                            label: "macOS 13.4",
                            gridMaxWidth: "750px",
                            releases: [
                                { name: "macOS 13.4 beta 1", date: "March 28, 2023", alignment: "left" },
                                { name: "macOS 13.4 beta 2", date: "April 11, 2023", alignment: "right" },
                                { name: "macOS 13.4 beta 3", date: "April 25, 2023", alignment: "left" },
                                { name: "macOS 13.4 beta 4", date: "May 2, 2023", alignment: "right" },
                                {
                                    pair: [
                                        { name: "macOS 13.4 RC build", date: "May 9, 2023", note: "build 2: May 11, 2023\nbuild 3: May 16, 2023" },
                                        { name: "macOS 13.4 final build", date: "May 18, 2023" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name : "macOS 13.4.1", date: "June 21, 2023" }
                            ]
                        },
                        "13-6-x": {
                            label: "macOS 13.6.x",
                            gridMaxWidth: "950px",
                            releases: [
                                {
                                    quad: [
                                        { date: "macOS 13.6", note: "RC build 1: Aug 22, 2023\nRC build 2: Aug 30, 2023\nRC build 3: Sep 12, 2023\nFinal build: Sep 21, 2023" },
                                        { date: "macOS 13.6.1", note: "RC build 1: Oct 3, 2023\nRC build 2: Oct 10, 2023\nRC build 3: Oct 17, 2023\nFinal build: Oct 25, 2023" },
                                        { date: "macOS 13.6.2", note: "RC build: Oct 26, 2023\nFinal build: Nov 7, 2023" },
                                        { date: "macOS 13.6.3", note: "RC build 1: Nov 9, 2023\nRC build 2: Nov 14, 2023\nRC build 3: Nov 28, 2023\nRC build 4: Dec 5, 2023\nFinal build: Dec 11, 2023" },
                                    ],
                                    className: "release-quad-tight"
                                },
                                {
                                    quad: [
                                        { date: "macOS 13.6.4", note: "RC build 1: Dec 12, 2023\nRC build 2: Jan 3, 2024\nRC build 3: Jan 9, 2024\nFinal build: Jan 17, 2024" },
                                        { date: "macOS 13.6.5", note: "RC build 1: Jan 29, 2024\nRC build 2: Feb 6, 2024\nRC build 3: Feb 20, 2024\nRC build 4: Feb 27, 2024\nRC build 5: Mar 4, 2024\nFinal build: Mar 7, 2024" },
                                        { date: "macOS 13.6.6", note: "Final build: Mar 25, 2024" },
                                        { date: "macOS 13.6.7", note: "RC build 1: Apr 2, 2024\nRC build 2: Apr 16, 2024\nRC build 3: Apr 23, 2024\nRC build 4: Apr 30, 2024\nRC build 5: May 9, 2024\nRC build 6: May 13, 2024\nRC build 7: Jun 17, 2024\nRC build 8: Jul 1, 2024" },                            
                                    ],
                                    className: "release-quad-tight"
                                },
                                {
                                    quad: [
                                        { date: "macOS 13.6.8", note: "RC build 1: Jul 9, 2024\nRC build 2: Jul 16, 2024\nRC build 3: Jul 23, 2024\nFinal build: Jul 29, 2024" },
                                        { date: "macOS 13.6.9", note: "Final build: Aug 7, 2024" },                            
                                    ],
                                    className: "release-quad-tight"
                                },
                            ]
                        },
                        "13-7-x": {
                            label: "macOS 13.7.x",
                            gridMaxWidth: "950px",
                            releases: [
                                {
                                    pair: [
                                        { date: "macOS 13.7", note: "RC build 1: Aug 28, 2024\nRC build 2: Sep 9, 2024\nFinal build: Sep 16, 2024" },
                                        { date: "macOS 13.7.1", note: "RC build 1: Sep 23, 2024\nRC build 2: Oct 7, 2024\nRC build 3: Oct 15, 2024\nRC build 4: Oct 21, 2024\nFinal build: Oct 28, 2024" },
                                    ],
                                    className: "release-pair-compact"
                                },
                                {
                                    pair: [
                                        { date: "macOS 13.7.2", note: "RC build 1: Nov 5, 2024\nRC build 2: Nov 11, 2024\nRC build 3: Nov 20, 2024\nRC build 4: Dec 5, 2024\nFinal build: Dec 11, 2024" },
                                        { date: "macOS 13.7.3", note: "RC build 1: Dec 16, 2024\nRC build 2: Jan 7, 2025\nRC build 3: Jan 16, 2025\nRC build 4: Jan 21, 2025\nFinal build: Jan 27, 2025" },
                                    ],
                                    className: "release-pair-compact"
                                },
                                {
                                    pair: [
                                        { date: "macOS 13.7.4", note: "Final build: Feb 10, 2025" },
                                        { date: "macOS 13.7.5", note: "RC build 1: Feb 21, 2025\nRC build 2: Mar 3, 2025\nRC build 3: Mar 10, 2025\nRC build 4: Mar 17, 2025\nRC build 5: Mar 24, 2025\nFinal build: Mar 31, 2025" },
                                    ],
                                    className: "release-pair-compact"
                                },
                                {
                                    pair: [
                                        { date: "macOS 13.7.6", note: "RC build 1: Apr 14, 2025\nRC build 2: Apr 21, 2025\nRC build 3: Apr 28, 2025\nRC build 4: May 6, 2025\nFinal build: May 12, 2025" },
                                        { date: "macOS 13.7.7", note: "RC build 1: Jun 18, 2025\nRC build 2: Jun 30, 2025\nRC build 4: Jul 14, 2025\nRC build 5: Jul 21, 2025\nFinal build: Jul 29, 2025" },
                                    ],
                                    className: "release-pair-compact"
                                },
                                { date: "macOS 13.7.8", note: "Final build: Aug 20, 2025", spanTwo: true },
                            ]
                        }
                    };
            initializeTimelinePage(timelines);
        },
        "macos-14.html": () => {
            const timelines = {
                        "14-0": {
                            label: "macOS 14.0",
                            gridMaxWidth: "750px",
                            releases: [
                                { name: "macOS 14.0 beta 1", date: "June 5, 2023", alignment: "left" },
                                { name: "macOS 14.0 beta 2", date: "June 21, 2023", alignment: "right" },
                                { name: "macOS 14.0 beta 3", date: "July 5, 2023", note: "build 2: July 11, 2023", alignment: "left" },
                                { name: "macOS 14.0 beta 4", date: "July 25, 2023", note: "build 2: July 31, 2023", alignment: "right" },
                                { name: "macOS 14.0 beta 5", date: "August 8, 2023", alignment: "left" },
                                { name: "macOS 14.0 beta 6", date: "August 22, 2023", alignment: "right" },
                                { name: "macOS 14.0 beta 7", date: "August 29, 2023", spanTwo: true },
                                {
                                    pair: [
                                        { name: "macOS 14.0 RC build", date: "September 12, 2023", note: "build 2: September 21, 2023" },
                                        { name: "macOS 14.0 final build", date: "September 26, 2023" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "14-1": {
                            label: "macOS 14.1",
                            gridMaxWidth: "750px",
                            releases: [
                                { name: "macOS 14.1 beta 1", date: "September 27, 2023", alignment: "left" },
                                { name: "macOS 14.1 beta 2", date: "October 3, 2023", alignment: "right" },
                                { name: "macOS 14.1 beta 3", date: "October 10, 2023", spanTwo: true },
                                {
                                    pair: [
                                        { name: "macOS 14.1 RC build", date: "October 17, 2023" },
                                        { name: "macOS 14.1 final build", date: "October 25, 2023", note: "build 2: November 1, 2023" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                {
                                    pair: [
                                        { name: "macOS 14.1.1", date: "November 7, 2023" },
                                        { name: "macOS 14.1.2", date: "November 30, 2023" },
                                    ],
                                    className: "release-pair-tight"
                                }
                            ]
                        },
                        "14-2": {
                            label: "macOS 14.2",
                            gridMaxWidth: "750px",
                            releases: [
                                { name: "macOS 14.2 beta 1", date: "October 26, 2023", alignment: "left" },
                                { name: "macOS 14.2 beta 2", date: "November 9, 2023", alignment: "right" },
                                { name: "macOS 14.2 beta 3", date: "November 14, 2023", alignment: "left" },
                                { name: "macOS 14.2 beta 4", date: "November 28, 2023", alignment: "right" },
                                {
                                    pair: [
                                        { name: "macOS 14.2 RC build", date: "December 5, 2023", note: "build 2: December 7, 2023" },
                                        { name: "macOS 14.2 final build", date: "December 11, 2023" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "macOS 14.2.1", date: "December 19, 2023" }
                            ]
                        },
                        "14-3": {
                            label: "macOS 14.3",
                            gridMaxWidth: "750px",
                            releases: [
                                { name: "macOS 14.3 beta 1", date: "December 12, 2023", alignment: "left" },
                                { name: "macOS 14.3 beta 2", date: "January 3, 2024", alignment: "right" },
                                { name: "macOS 14.3 beta 3", date: "January 9, 2024", spanTwo: true },
                                {
                                    pair: [
                                        { name: "macOS 14.3 RC build", date: "January 17, 2024" },
                                        { name: "macOS 14.3 final build", date: "January 22, 2024" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "macOS 14.3.1", date: "February 8, 2024" },
                            ]
                        },
                        "14-4": {
                            label: "macOS 14.4",
                            gridMaxWidth: "750px",
                            releases: [
                                { name: "macOS 14.4 beta 1", date: "January 29, 2024", alignment: "left" },
                                { name: "macOS 14.4 beta 2", date: "February 6, 2024", alignment: "right" },
                                { name: "macOS 14.4 beta 3", date: "February 13, 2024", alignment: "left" },
                                { name: "macOS 14.4 beta 4", date: "February 20, 2024", alignment: "right" },
                                {
                                    pair: [
                                        { name: "macOS 14.4 RC build", date: "March 4, 2024" },
                                        { name: "macOS 14.4 final build", date: "March 7, 2024" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "macOS 14.4.1", date: "March 25, 2024" }
                            ]
                        },
                        "14-5": {
                            label: "macOS 14.5",
                            gridMaxWidth: "750px",
                            releases: [
                                { name: "macOS 14.5 beta 1", date: "April 2, 2024", alignment: "left" },
                                { name: "macOS 14.5 beta 2", date: "April 16, 2024", alignment: "right" },
                                { name: "macOS 14.5 beta 3", date: "April 23, 2024", alignment: "left" },
                                { name: "macOS 14.5 beta 4", date: "April 30, 2024", alignment: "right" },
                                {
                                    pair: [
                                        { name: "macOS 14.5 RC build", date: "May 9, 2024" },
                                        { name: "macOS 14.5 final build", date: "May 13, 2024" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "14-6": {
                            label: "macOS 14.6",
                            gridMaxWidth: "750px",
                            releases: [
                                { name: "macOS 14.6 beta 1", date: "June 17, 2024", alignment: "left" },
                                { name: "macOS 14.6 beta 2", date: "July 1, 2024", alignment: "right" },
                                { name: "macOS 14.6 beta 3", date: "July 9, 2024", alignment: "left" },
                                { name: "macOS 14.6 beta 4", date: "July 16, 2024", alignment: "right"},
                                {
                                    pair: [
                                        { name: "macOS 14.6 RC build", date: "July 23, 2024" },
                                        { name: "macOS 14.6 final build", date: "July 29, 2024" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "macoS 14.6.1", date: "August 7, 2024" },
                            ]
                        },
                        "14-7-x": {
                            label: "macOS 14.7.x",
                            gridMaxWidth: "950px",
                            releases: [
                                {
                                    pair: [
                                        { date: "macOS 14.7", note: "RC build 1: Aug 28, 2024\nRC build 2: Sep 9, 2024\nFinal build: Sep 16, 2024" },
                                        { date: "macOS 14.7.1", note: "RC build 1: Sep 23, 2024\nRC build 2: Oct 7, 2024\nRC build 3: Oct 15, 2024\nRC build 4: Oct 21, 2024\nFinal build: Oct 28, 2024" },
                                    ],
                                    className: "release-pair-compact"
                                },
                                {
                                    pair: [
                                        { date: "macOS 14.7.2", note: "RC build 1: Nov 5, 2024\nRC build 2: Nov 11, 2024\nRC build 3: Nov 20, 2024\nRC build 4: Dec 5, 2024\nFinal build: Dec 11, 2024" },
                                        { date: "macOS 14.7.3", note: "RC build 1: Dec 16, 2024\nRC build 2: Jan 7, 2025\nRC build 3: Jan 16, 2025\nRC build 4: Jan 21, 2025\nFinal build: Jan 27, 2025" },
                                    ],
                                    className: "release-pair-compact"
                                },
                                {
                                    pair: [
                                        { date: "macOS 14.7.4", note: "Final build: Feb 10, 2025" },
                                        { date: "macOS 14.7.5", note: "RC build 1: Feb 21, 2025\nRC build 2: Mar 3, 2025\nRC build 3: Mar 10, 2025\nRC build 4: Mar 17, 2025\nRC build 5: Mar 24, 2025\nFinal build: Mar 31, 2025" },
                                    ],
                                    className: "release-pair-compact"
                                },
                                {
                                    pair: [
                                        { date: "macOS 14.7.6", note: "RC build 1: Apr 14, 2025\nRC build 2: Apr 21, 2025\nRC build 3: Apr 28, 2025\nRC build 4: May 6, 2025\nFinal build: May 12, 2025" },
                                        { date: "macOS 14.7.7", note: "RC build 1: Jun 18, 2025\nRC build 2: Jun 30, 2025\nRC build 4: Jul 14, 2025\nRC build 5: Jul 21, 2025\nFinal build: Jul 29, 2025" },
                                    ],
                                    className: "release-pair-compact"
                                },
                                { date: "macOS 14.7.8", note: "Final build: Aug 20, 2025", spanTwo: true },
                            ]
                        },
                        "14-8-x": {
                            label: "macOS 14.8.x",
                            gridMaxWidth: "950px",
                            footnote: "1: macOS 14.8.7 RC build 1 continues macOS 14.8.6 RC build 2.",
                            releases: [
                                {
                                    pair: [
                                        { date: "macOS 14.8", note: "RC build 1: Aug 5, 2025\nRC build 2: Aug 11, 2025\nRC build 3: Aug 18, 2025\nRC build 4: Aug 25, 2025\nRC build 5: Sep 2, 2025\nRC build 6: Sep 9, 2025\nFinal build: Sep 15, 2025" },
                                        { date: "macOS 14.8.1", note: "RC build: Sep 22, 2025\nFinal build: Sep 29, 2025" },
                                    ],
                                    className: "release-pair-compact"
                                },
                                {
                                    pair: [
                                        { date: "macOS 14.8.2", note: "RC build 1: Oct 6, 2025\nRC build 2: Oct 13, 2025\nRC build 3: Oct 20, 2025\nRC build 4: Oct 28, 2025\nFinal build: Nov 3, 2025" },
                                        { date: "macOS 14.8.3", note: "RC build 1: Nov 6, 2025\nRC build 2: Nov 12, 2025\nRC build 3: Nov 17, 2025\nRC build 4: Dec 3, 2025\nFinal build: Dec 12, 2025" },
                                    ],
                                    className: "release-pair-compact"
                                },
                                {
                                    pair: [
                                        { date: "macOS 14.8.4", note: "RC build 1: Dec 15, 2025\nRC build 2: Jan 12, 2026\nRC build 3: Jan 26, 2026\nRC build 4: Feb 4, 2026\nFinal build: Feb 11, 2026" },
                                        { date: "macOS 14.8.5", note: "RC build 1: Feb 16, 2026\nRC build 2: Feb 23, 2026\nRC build 3: Mar 2, 2026\nRC build 4: Mar 9, 2026\nRC build 5: Mar 18, 2026\nFinal build: Mar 24, 2026" },
                                    ],
                                    className: "release-pair-compact"
                                },
                                {
                                    pair: [
                                        { date: "macOS 14.8.6", note: "RC build 1: Mar 30, 2026\nRC build 2: Apr 13, 2026" },
                                        { date: "macOS 14.8.7", note: "RC build 1&#185;: Apr 20, 2026\nRC build 2: Apr 27, 2026\nRC build 3: May 4, 2026\nFinal build: May 11, 2026" },
                                    ],
                                    className: "release-pair-compact"
                                },
                                {
                                    pair: [
                                        { date: "macOS 14.8.8", note: "RC build 1: May 26, 2026\nRC build 2: Jun 15, 2026\nRC build 3: Jun 29, 2026\nRC build 4: Jul 6, 2026\nRC build 5: Jul 13, 2026\nRC build 6: Jul 20, 2026\nRC build 7: Jul 24, 2026\nFinal build: Jul 27, 2026" },
                                        { date: "macOS 14.8.9", note: "Final build: Aug 6, 2026" },
                                    ],
                                    className: "release-pair-compact"
                                },
                            ]
                        },
                    };
            initializeTimelinePage(timelines);
        },
        "macos-15.html": () => {
            const timelines = {
                        "15-0": {
                            label: "macOS 15.0",
                            gridMaxWidth: "750px",
                            releases: [
                                { name: "macOS 15.0 beta 1", date: "June 10, 2024", alignment: "left" },
                                { name: "macOS 15.0 beta 2", date: "June 24, 2024", alignment: "right" },
                                { name: "macOS 15.0 beta 3", date: "July 10, 2024", note: "build 2: July 15, 2024", alignment: "left" },
                                { name: "macOS 15.0 beta 4", date: "July 23, 2024", alignment: "right" },
                                { name: "macOS 15.0 beta 5", date: "August 5, 2024", alignment: "left" },
                                { name: "macOS 15.0 beta 6", date: "August 12, 2024", alignment: "right" },
                                { name: "macOS 15.0 beta 7", date: "August 20, 2024", alignment: "left" },
                                { name: "macOS 15.0 beta 8", date: "August 28, 2024", alignment: "right" },
                                {
                                    pair: [
                                        { name: "macOS 15.0 RC build", date: "September 9, 2024" },
                                        { name: "macOS 15.0 final build", date: "September 16, 2024" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "macOS 15.0.1", date: "October 3, 2024" }
                            ]
                        },
                        "15-1": {
                            label: "macOS 15.1",
                            gridMaxWidth: "750px",
                            releases: [
                                { name: "macOS 15.1 beta 1", date: "July 29, 2024", alignment: "left" },
                                { name: "macOS 15.1 beta 2", date: "August 12, 2024", alignment: "right" },
                                { name: "macOS 15.1 beta 3", date: "August 28, 2024", alignment: "left" },
                                { name: "macOS 15.1 beta 4", date: "September 17, 2024", alignment: "right" },
                                { name: "macOS 15.1 beta 5", date: "September 23, 2024", alignment: "left" },
                                { name: "macOS 15.1 beta 6", date: "October 7, 2024", alignment: "right" },
                                { name: "macOS 15.1 beta 7", date: "October 14, 2024", spanTwo: true },
                                {
                                    pair: [
                                        { name: "macOS 15.1 RC build", date: "October 21, 2024", note: "build 2: October 24, 2024" },
                                        { name: "macOS 15.1 final build", date: "October 28, 2024" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "macOS 15.1.1", date: "November 19, 2024" }
                            ]
                        },
                        "15-2": {
                            label: "macOS 15.2",
                            gridMaxWidth: "750px",
                            releases: [
                                { name: "macOS 15.2 beta 1", date: "October 23, 2024", alignment: "left" },
                                { name: "macOS 15.2 beta 2", date: "November 4, 2024", alignment: "right" },
                                { name: "macOS 15.2 beta 3", date: "November 11, 2024", alignment: "left" },
                                { name: "macOS 15.2 beta 4", date: "November 20, 2024", alignment: "right" },
                                {
                                    pair: [
                                        { name: "macOS 15.2 RC build", date: "December 5, 2024", note: "build 2: December 9, 2024" },
                                        { name: "macOS 15.2 final build", date: "December 11, 2024" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "macOS 15.2.1", date: "January 6, 2025" }
                            ]
                        },
                        "15-3": {
                            label: "macOS 15.3",
                            gridMaxWidth: "750px",
                            releases: [
                                { name: "macOS 15.3 beta 1", date: "December 16, 2024", alignment: "left" },
                                { name: "macOS 15.3 beta 2", date: "January 7, 2025", alignment: "right" },
                                { name: "macOS 15.3 beta 3", date: "January 16, 2025", spanTwo: true },
                                {
                                    pair: [
                                        { name: "macOS 15.3 RC build", date: "January 21, 2025" },
                                        { name: "macOS 15.3 final build", date: "January 27, 2025" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                {
                                    pair: [
                                        { name: "macOS 15.3.1", date: "February 10, 2025" },
                                        { name: "macoS 15.3.2", date: "March 11, 2025" },
                                    ],
                                    className: "release-pair-tight"
                                }
                            ]
                        },
                        "15-4": {
                            label: "macOS 15.4",
                            gridMaxWidth: "750px",
                            releases: [
                                { name: "macOS 15.4 beta 1", date: "February 21, 2025", alignment: "left" },
                                { name: "macOS 15.4 beta 2", date: "March 3, 2025", alignment: "right" },
                                { name: "macOS 15.4 beta 3", date: "March 10, 2025", alignment: "left" },
                                { name: "macOS 15.4 beta 4", date: "March 17, 2025", alignment: "right" },
                                {
                                    pair: [
                                        { name: "macOS 15.4 RC build", date: "March 24, 2025", note: "build 2: March 27, 2025" },
                                        { name: "macOS 15.4 final build", date: "March 31, 2025" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "macOS 15.4.1", date: "April 16, 2025" }
                            ]
                        },
                        "15-5": {
                            label: "macOS 15.5",
                            gridMaxWidth: "750px",
                            releases: [
                                { name: "macOS 15.5 beta 1", date: "April 2, 2025", alignment: "left" },
                                { name: "macOS 15.5 beta 2", date: "April 14, 2025", alignment: "right" },
                                { name: "macOS 15.5 beta 3", date: "April 21, 2025", alignment: "left" },
                                { name: "macOS 15.5 beta 4", date: "April 28, 2025", alignment: "right" },
                                {
                                    pair: [
                                        { name: "macOS 15.5 RC build", date: "May 6, 2025" },
                                        { name: "macOS 15.5 final build", date: "May 12, 2025" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ]
                        },
                        "15-6": {
                            label: "macOS 15.6",
                            gridMaxWidth: "750px",
                            releases: [
                                { name: "macOS 15.6 beta 1", date: "June 16, 2025", alignment: "left" },
                                { name: "macOS 15.6 beta 2", date: "June 30, 2025", alignment: "right" },
                                { name: "macOS 15.6 beta 3", date: "July 14, 2025", spanTwo: true },
                                {
                                    pair: [
                                        { name: "macOS 15.6 RC build", date: "July 21, 2025" },
                                        { name: "macOS 15.6 final build", date: "July 29, 2025" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "macOS 15.6.1", date: "August 20, 2025" }
                            ]
                        },
                        "15-7-x": {
                            label: "macOS 15.7.x",
                            gridMaxWidth: "950px",
                            footnote: "1: macOS 15.7.7 RC build 1 continues macOS 15.7.6 RC build 2.",
                            releases: [
                                {
                                    pair: [
                                        { date: "macOS 15.7", note: "RC build 1: Aug 5, 2025\nRC build 2: Aug 11, 2025\nRC build 3: Aug 18, 2025\nRC build 4: Aug 25, 2025\nRC build 5: Sep 2, 2025\nRC build 6: Sep 9, 2025\nFinal build: Sep 15, 2025" },
                                        { date: "macOS 15.7.1", note: "RC build: Sep 22, 2025\nFinal build: Sep 29, 2025" },
                                    ],
                                    className: "release-pair-compact"
                                },
                                {
                                    pair: [
                                        { date: "macOS 15.7.2", note: "RC build 1: Oct 6, 2025\nRC build 2: Oct 13, 2025\nRC build 3: Oct 20, 2025\nRC build 4: Oct 28, 2025\nFinal build: Nov 3, 2025" },
                                        { date: "macOS 15.7.3", note: "RC build 1: Nov 6, 2025\nRC build 2: Nov 12, 2025\nRC build 3: Nov 17, 2025\nRC build 4: Dec 3, 2025\nFinal build: Dec 12, 2025" },
                                    ],
                                    className: "release-pair-compact"
                                },
                                {
                                    pair: [
                                        { date: "macOS 15.7.4", note: "RC build 1: Dec 15, 2025\nRC build 2: Jan 12, 2026\nRC build 3: Jan 26, 2026\nRC build 4: Feb 4, 2026\nFinal build: Feb 11, 2026" },
                                        { date: "macOS 15.7.5", note: "RC build 1: Feb 16, 2026\nRC build 2: Feb 23, 2026\nRC build 3: Mar 2, 2026\nRC build 4: Mar 9, 2026\nRC build 5: Mar 18, 2026\nFinal build: Mar 24, 2026" },
                                    ],
                                    className: "release-pair-compact"
                                },
                                {
                                    pair: [
                                        { date: "macOS 15.7.6", note: "RC build 1: Mar 30, 2026\nRC build 2: Apr 13, 2026" },
                                        { date: "macOS 15.7.7", note: "RC build 1&#185;: Apr 20, 2026\nRC build 2: Apr 27, 2026\nRC build 3: May 4, 2026\nFinal build: May 11, 2026" },
                                    ],
                                    className: "release-pair-compact"
                                },
                                {
                                    pair: [
                                        { date: "macOS 15.7.8", note: "RC build 1: May 26, 2026\nRC build 2: Jun 15, 2026\nRC build 3: Jun 29, 2026\nRC build 4: Jul 6, 2026\nRC build 5: Jul 13, 2026\nRC build 6: Jul 20, 2026\nRC build 7: Jul 24, 2026\nFinal build: Jul 27, 2026" },
                                        { date: "macOS 15.7.9", note: "Final build: Aug 6, 2026" },
                                    ],
                                    className: "release-pair-compact"
                                },
                            ]
                        },
                        "15-8-x": {
                            label: "macOS 15.8.x",
                            gridMaxWidth: "950px",
                            releases: [
                                {
                                    trio: [
                                        { date: "macOS 15.8", note: "RC build 1: Aug 17, 2026\nRC build 2: Aug 24, 2026\nRC build 3: Aug 31, 2026\nRC build 4: Sep 9, 2026\nFinal build: Sep 14, 2026" },
                                        { date: "macOS 15.8.1", note: "RC build 1: Sep 16, 2026\nRC build 2: Sep 21, 2026\nFinal build: Sep 28, 2026" },
                                        { date: "macOS 15.8.2", note: "RC build 1: Oct 6, 2026\nRC build 2: Oct 13, 2026\nRC build 3: Oct 19, 2026\nFinal build: Oct 26, 2026" },
                                    ],
                                    className: "release-trio-tight"
                                },
                                { date: "macOS 15.8.3", note: "RC build 1: Nov 3, 2026\nFinal build: Nov 9, 2026", spanTwo: true }
                            ]
                        }
                    };
            initializeTimelinePage(timelines);
        },
        "macos-26.html": () => {
            const timelines = {
                        "26-0": {
                            label: "macOS 26.0",
                            releases: [
                                { name: "macOS 26.0 beta 1", date: "Jun 9, 2025" },
                                { name: "macOS 26.0 beta 2", date: "Jun 23, 2025" },
                                { name: "macOS 26.0 beta 3", date: "Jul 7, 2025" },
                                { name: "macOS 26.0 beta 4", date: "Jul 22, 2025" },
                                { name: "macOS 26.0 beta 5", date: "Aug 5, 2025", note: "build 2: Aug 7, 2025" },
                                { name: "macOS 26.0 beta 6", date: "Aug 11, 2025" },
                                { name: "macOS 26.0 beta 7", date: "Aug 18, 2025" },
                                { name: "macOS 26.0 beta 8", date: "Aug 25, 2025" },
                                { name: "macOS 26.0 beta 9", date: "Sep 2, 2025", spanTwo: true },
                                {
                                    pair: [
                                        { name: "macOS 26.0 RC build", date: "Sep 9, 2025" },
                                        { name: "macOS 26.0 final build", date: "Sep 15, 2025" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "macOS 26.0.1", date: "Sep 29, 2025" }
                            ]
                        },
                        "26-1": {
                            label: "macOS 26.1",
                            releases: [
                                { name: "macOS 26.1 beta 1", date: "Sep 22, 2025" },
                                { name: "macOS 26.1 beta 2", date: "Oct 6, 2025" },
                                { name: "macOS 26.1 beta 3", date: "Oct 13, 2025" },
                                { name: "macOS 26.1 beta 4", date: "Oct 20, 2025" },
                                {
                                    pair: [
                                        { name: "macOS 26.1 RC build", date: "Oct 28, 2025" },
                                        { name: "macOS 26.1 final build", date: "Nov 3, 2025" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ]
                        },
                        "26-2": {
                            label: "macOS 26.2",
                            releases: [
                                { name: "macOS 26.2 beta 1", date: "Nov 4, 2025" },
                                { name: "macOS 26.2 beta 2", date: "Nov 12, 2025" },
                                { name: "macOS 26.2 beta 3", date: "Nov 17, 2025", spanTwo: true },
                                {
                                    pair: [
                                        { name: "macOS 26.2 RC build", date: "Dec 3, 2025" },
                                        { name: "macOS 26.2 final build", date: "Dec 12, 2025" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "26-3": {
                            label: "macOS 26.3",
                            releases: [
                                { name: "macOS 26.3 beta 1", date: "Dec 15, 2025" },
                                { name: "macOS 26.3 beta 2", date: "Jan 12, 2026" },
                                { name: "macOS 26.3 beta 3", date: "Jan 26, 2026", spanTwo: true },
                                {
                                    pair: [
                                        { name: "macOS 26.3 RC build", date: "Feb 4, 2026" },
                                        { name: "macOS 26.3 final build", date: "Feb 11, 2026" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                {
                                    pair: [
                                        { name: "macOS 26.3.1", date: "Mar 4, 2026" },
                                        { name: "macOS 26.3.2", date: "Mar 10, 2026" }
                                    ],
                                    className: "release-pair-tight"
                                }
                            ]
                        },
                        "26-4": {
                            label: "macOS 26.4",
                            releases: [
                                { name: "macOS 26.4 beta 1", date: "Feb 16, 2026" },
                                { name: "macOS 26.4 beta 2", date: "Feb 23, 2026" },
                                { name: "macOS 26.4 beta 3", date: "Mar 3, 2026" },
                                { name: "macOS 26.4 beta 4", date: "Mar 9, 2026" },
                                {
                                    pair: [
                                        { name: "macOS 26.4 RC build", date: "Mar 18, 2026" },
                                        { name: "macOS 26.4 final build", date: "Mar 24, 2026" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "macOS 26.4.1", date: "Apr 9, 2026" }
                            ]
                        },
                        "26-5": {
                            label: "macOS 26.5",
                            releases: [
                                { name: "macOS 26.5 beta 1", date: "Mar 30, 2026" },
                                { name: "macOS 26.5 beta 2", date: "Apr 13, 2026" },
                                { name: "macOS 26.5 beta 3", date: "Apr 20, 2026" },
                                { name: "macOS 26.5 beta 4", date: "Apr 27, 2026" },
                                {
                                    pair: [
                                        { name: "macOS 26.5 RC build", date: "May 4, 2026" },
                                        { name: "macOS 26.5 final build", date: "May 11, 2026" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                {
                                    pair: [
                                        { name: "macOS 26.5.1", date: "Jun 1, 2026" },
                                        { name: "macOS 26.5.2", date: "Jun 29, 2026" }
                                    ],
                                    className: "release-pair-tight"
                                }
                            ]
                        },
                        "26-6": {
                            label: "macOS 26.6",
                            releases: [
                                { name: "macOS 26.6 beta 1", date: "May 26, 2026" },
                                { name: "macOS 26.6 beta 2", date: "Jun 15, 2026" },
                                { name: "macOS 26.6 beta 3", date: "Jun 29, 2026" },
                                { name: "macOS 26.6 beta 4", date: "Jul 6, 2026" },
                                { name: "macOS 26.6 beta 5", date: "Jul 13, 2026", spanTwo: true },
                                {
                                    pair: [
                                        { name: "macOS 26.6 RC build", date: "Jul 20, 2026" },
                                        { name: "macOS 26.6 final build", date: "Jul 27, 2026" }
            
                                    ],
                                    className: "release-pair-builds"
                                },
                            ],
                            supplemental: [
                                {
                                    pair: [
                                        { date: "macOS 26.6.1", note: "Final build: Aug 6, 2026" },
                                        { date: "macOS 26.6.2", note: "RC build: Aug 10, 2026\nFinal build: Aug 17, 2026" }
                                    ],
                                    className: "release-pair-tight"
                                },
                            ]
                        },
                        "26-7-x": {
                            label: "macOS 26.7.x",
                            releases: [
                                {
                                    trio: [
                                        { date: "macOS 26.7", note: "RC build 1: Aug 17, 2026\nRC build 2: Aug 24, 2026\nRC build 3: Aug 31, 2026\nRC build 4: Sep 9, 2026\nFinal build: Sep 14, 2026" },
                                        { date: "macOS 26.7.1", note: "RC build 1: Sep 16, 2026\nRC build 2: Sep 21, 2026\nFinal build: Sep 28, 2026" },
                                        { date: "macOS 26.7.2", note: "RC build 1: Oct 6, 2026\nRC build 2: Oct 13, 2026\nRC build 3: Oct 19, 2026\nFinal build: Oct 26, 2026" },
                                    ],
                                    className: "release-trio-tight"
                                },
                                { date: "macOS 26.7.3", note: "RC build 1: Nov 3, 2026\nFinal build 2: Nov 9, 2026", spanTwo: true },
                        ],
                        },
                    };
            initializeTimelinePage(timelines);
        },
        "macos-27.html": () => {
            const timelines = {
                        "27-0": {
                            label: "macOS 27.0",
                            releases: [
                                { name: "macOS 27.0 beta 1", date: "Jun 8, 2026" },
                                { name: "macOS 27.0 beta 2", date: "Jun 22, 2026" },
                                { name: "macOS 27.0 beta 3", date: "Jul 6, 2026" },
                                { name: "macOS 27.0 beta 4", date: "Jul 20, 2026" },
                                { name: "macOS 27.0 beta 5", date: "Aug 10, 2026" },
                                { name: "macOS 27.0 beta 6", date: "Aug 17, 2026" },
                                { name: "macOS 27.0 beta 7", date: "Aug 24, 2026" },
                                { name: "macOS 27.0 beta 8", date: "Aug 31, 2026" },
                                {
                                    pair: [
                                        { name: "macOS 27.0 RC build", date: "Sep 9, 2026" },
                                        { name: "macOS 27.0 final build", date: "Sep 14, 2026" },
                                    ],
                                    className: "release-pair-builds"
                                },                    
                            ],
                            supplemental: [
                                { name: "macOS 27.0.1", date: "Sep 28, 2026" },
                            ]
                        },
                        "27-2": {
                            label: "macOS 27.2",
                            releases: [
                                { name: "macOS 27.2 beta 1", date: "Sep 16, 2026" },
                                { name: "macOS 27.2 beta 2", date: "Sep 21, 2026" },
                                { name: "macOS 27.2 beta 3", date: "Oct 5, 2026" },
                                { name: "macOS 27.2 beta 4", date: "Oct 13, 2026" },
                                {
                                    pair: [
                                        { name: "macOS 27.2 RC build", date: "Oct 19, 2026" },
                                        { name: "macOS 27.2 RC build", date: "Oct 26, 2026" },
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "macOS 27.2.1", date: "Nov 9, 2026" },
                            ]
                        },
                        "27-3": {
                            label: "macOS 27.3",
                            releases: [
                                { name: "macOS 27.3 beta 1", date: "Nov 3, 2026", spanTwo: true },
                            ]
                        }
                    };
            initializeTimelinePage(timelines);
        },
        "os-x-10-10.html": () => {
            const timelines = {
                        "10-10": {
                            label: "OS X 10.10",
                            releases: [
                                { name: "OS X 10.10 beta 1", date: "June 2, 2014", alignment: "left" },
                                { name: "OS X 10.10 beta 2", date: "June 17, 2014", alignment: "right" },
                                { name: "OS X 10.10 beta 3", date: "July 7, 2014", alignment: "left" },
                                { name: "OS X 10.10 beta 4", date: "July 21, 2014", alignment: "right" },
                                { name: "OS X 10.10 beta 5", date: "August 4, 2014", alignment: "left" },
                                { name: "OS X 10.10 beta 6", date: "August 18, 2014", alignment: "right" },
                                { name: "OS X 10.10 beta 7", date: "September 2, 2014", alignment: "left" },
                                { name: "OS X 10.10 beta 8", date: "September 15, 2014", alignment: "right" },
                                {
                                    pair: [
                                        { name: "OS X 10.10 GM build", date: "September 30, 2014", note: "build 2: October 7, 2014\nbuild 3: October 9, 2014" },
                                        { name: "OS X 10.10 final build", date: "October 16, 2014" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "10-10-1": {
                            label: "OS X 10.10.1",
                            releases: [
                                { name: "OS X 10.10.1 beta 1", date: "November 3, 2014", alignment: "left" },
                                { name: "OS X 10.10.1 beta 2", date: "November 10, 2014", alignment: "right" },
                                { name: "OS X 10.10.1 final build", date: "November 17, 2014", spanTwo: true },
                                { name: "OS X 10.10.1 NTP Update", date: "December 22, 2014", spanTwo: true },
                            ],
                        },
                        "10-10-2": {
                            label: "OS X 10.10.2",
                            releases: [
                                { name: "OS X 10.10.2 beta 1", date: "November 20, 2014", alignment: "left" },
                                { name: "OS X 10.10.2 beta 2", date: "December 4, 2014", alignment: "right" },
                                { name: "OS X 10.10.2 beta 3", date: "December 12, 2014", alignment: "left" },
                                { name: "OS X 10.10.2 beta 4", date: "December 20, 2014", alignment: "right" },
                                { name: "OS X 10.10.2 beta 5", date: "January 7, 2015", alignment: "left" },
                                { name: "OS X 10.10.2 beta 6", date: "January 21, 2015", alignment: "right" },
                                { name: "OS X 10.10.2 final build", date: "January 27, 2015", spanTwo: true }
                            ],
                        },
                        "10-10-3": {
                            label: "OS X 10.10.3",
                            releases: [
                                { name: "OS X 10.10.3 beta 1", date: "February 5, 2015", alignment: "left" },
                                { name: "OS X 10.10.3 beta 2", date: "February 23, 2015", alignment: "right" },
                                { name: "OS X 10.10.3 beta 3", date: "March 12, 2015", alignment: "left" },
                                { name: "OS X 10.10.3 beta 4", date: "March 16, 2015", alignment: "right" },
                                { name: "OS X 10.10.3 beta 5", date: "March 23, 2015", alignment: "left" },
                                { name: "OS X 10.10.3 beta 6", date: "March 30, 2015", alignment: "right" }, 
                                { name: "OS X 10.10.3 beta 7", date: "April 2, 2015", spanTwo: true },                   
                                { name: "OS X 10.10.3 final build", date: "April 8, 2015", spanTwo: true }
                            ],
                        },
                        "10-10-4": {
                            label: "OS X 10.10.4",
                            releases: [
                                { name: "OS X 10.10.4 beta 1", date: "April 16, 2015", alignment: "left" },
                                { name: "OS X 10.10.4 beta 2", date: "April 27, 2015", alignment: "right" },
                                { name: "OS X 10.10.4 beta 3", date: "May 11, 2015", alignment: "left" },
                                { name: "OS X 10.10.4 beta 4", date: "May 26, 2015", alignment: "right" },
                                { name: "OS X 10.10.4 beta 5", date: "June 9, 2015", note: "build 2: June 15, 2015", spanTwo: true },
                                { name: "OS X 10.10.4 final build", date: "June 30, 2015", spanTwo: true }
                            ],
                        },
                        "10-10-5": {
                            label: "OS X 10.10.5",
                            gridMaxWidth: "1310px",
                            sectionedLayout: true,
                            releases: [
                                { mainLabel: "Main Update" },
                                { name: "OS X 10.10.5 beta 1", date: "July 14, 2015", alignment: "left" },
                                { name: "OS X 10.10.5 beta 2", date: "July 30, 2015", alignment: "right" },
                                { name: "OS X 10.10.5 beta 3", date: "August 5, 2015", spanTwo: true },
                                { name: "OS X 10.10.5 final build", date: "August 13, 2015", spanTwo: true },
                                { 
                                    sectionLabel: "Security Updates",
                                    sectionWidth: "wide",
                                    sectionLayout: "security-grid",
                                },
                                { 
                                    trio: [
                                        { date: "2015-004", note: "Final build: Oct 21, 2015" },
                                        { date: "2015-005", note: "Final build: Dec 8, 2015" },
                                        { date: "2015-006", note: "Final build: Dec 11, 2015" },
                                ],
                                className: "release-trio-tight"
                                },
                                { 
                                    quad: [
                                        { date: "2016-001", note: "Final build: Jan 19, 2016" },
                                        { date: "2016-002", note: "Final build: Mar 21, 2016" },
                                        { date: "2016-003", note: "Final build: May 16, 2016", },
                                        { date: "2016-004", note: "beta 1: Jun 7, 2016\nbeta 2: Jul 6, 2016\nFinal build: Jul 18, 2016" },
                                ],
                                className: "release-quad-tight",
                                securityRow: "2021"
                                },
                                {
                                    trio: [
                                        { date: "2016-005", note: "Final build: Sep 1, 2016" },
                                        { date: "2016-006", note: "beta 1: Sep 24, 2016\nFinal build: Oct 24, 2016" },
                                        { date: "2016-007", note: "beta 1: Oct 31, 2016\nbeta 2: Nov 8, 2016\nbeta 3: Nov 4, 2016\nbeta 4: Nov 28, 2016\nbeta 5: Dec 5, 2016\nFinal build: Dec 13, 2016" },
                                    ],
                                    className: "release-trio-tight",
                                    securityRow: "2021"
                                },
                                {
                                    trio: [
                                        { date: "2017-001", note: "beta 1: Jan 24, 2017\nbeta 2: Feb 20, 2017\nbeta 3: Mar 7, 2017\nFinal build: Mar 27, 2017" },
                                        { date: "2017-002", note: "beta 1: Mar 28, 2017\nbeta 2: Apr 10, 2017\nbeta 3: Apr 17, 2017\nFinal build: May 15, 2017" },
                                        { date: "2017-003", note: "beta 1: May 16, 2017\nbeta 2: May 30, 2017\nbeta 3: Jun 13, 2017\nFinal build: Jul 19, 2017", },
                                    ],
                                    className: "release-trio-tight",
                                    securityRow: "2022"
                                },
                            ],
                        },
                    };
            
                    const versionSelect = document.getElementById("software-version");
                    const releaseGrid = document.getElementById("release-grid");
                    const timelineFootnote = document.getElementById("timeline-footnote");
            
                    function releaseMarkup(release) {
                        if (release.mainLabel) {
                            return `<p class="section-label span-two">${release.mainLabel}</p>`;
                        }
            
                        if (release.supplementalLabel || release.sectionLabel) {
                            return `<p class="section-label section-label-divider span-two">${release.supplementalLabel ?? release.sectionLabel}</p>`;
                        }
            
                        if (release.trio) {
                            const className = release.className ? ` ${release.className}` : "";
                            return `<div class="release-trio${className}">${release.trio.map(releaseMarkup).join("")}</div>`;
                        }
            
                        if (release.quad) {
                            const className = release.className ? " " + release.className : "";
                            return `<div class="release-quad${className}">${release.quad.map(releaseMarkup).join("")}</div>`;
                        }
                        if (release.pair) {
                            const className = release.className ? ` ${release.className}` : "";
                            return `<div class="release-pair${className}">${release.pair.map(releaseMarkup).join("")}</div>`;
                        }
            
                        const spanClass = release.spanTwo ? " span-two" : "";
                        const alignmentClass = release.alignment ? ` release-align-${release.alignment}` : "";
                        const name = release.name ? `<p class="release-name">${release.name}</p>` : "";
                        const note = release.note ? `<p class="release-note">${release.note}</p>` : "";
                        return `<article class="release${spanClass}${alignmentClass}">
                            ${name}
                            <p class="release-date">${release.date}</p>${note}
                        </article>`;
                    }
            
                    function sectionedReleasesMarkup(releases) {
                        const sections = [{ width: "standard", layout: "default", releases: [] }];
            
                        releases.forEach((release) => {
                            if (release.sectionWidth === "wide" && sections.at(-1).releases.length) {
                                sections.push({
                                    width: "wide",
                                    layout: release.sectionLayout ?? "default",
                                    releases: []
                                });
                            }
                            sections.at(-1).releases.push(release);
                        });
            
                        return sections.map((section) => {
                            const widthClass = section.width === "wide" ? " release-section-wide" : "";
                            if (section.layout !== "security-grid") {
                                return `<section class="release-section${widthClass}">
                                    ${section.releases.map(releaseMarkup).join("")}
                                </section>`;
                            }
            
                            const flatten = (release) => {
                                if (release.pair) return release.pair.flatMap(flatten);
                                if (release.trio) return release.trio.flatMap(flatten);
                                if (release.quad) return release.quad.flatMap(flatten);
                                return [release];
                            };
                            const desktopRows = [];
            
                            section.releases.forEach((release) => {
                                if (release.sectionLabel) {
                                    desktopRows.push({ label: release });
                                    return;
                                }
                                const previousRow = desktopRows.at(-1);
                                if (release.securityRow && previousRow?.key === release.securityRow) {
                                    previousRow.releases.push(release);
                                    return;
                                }
                                desktopRows.push({ key: release.securityRow, releases: [release] });
                            });
            
                            const desktopMarkup = desktopRows.map((row) => {
                                if (row.label) return releaseMarkup(row.label);
                                const rowReleases = row.releases.flatMap(flatten);
                                const contentClass = row.releases.some((release) => release.securityFitContent)
                                    ? " security-update-row--content"
                                    : "";
                                return `<div class="security-update-row security-update-row--${rowReleases.length}${contentClass}" style="--security-update-count: ${rowReleases.length}">
                                    ${rowReleases.map(releaseMarkup).join("")}
                                </div>`;
                            }).join("");
            
                            const mobileMarkup = section.releases.map((release) => {
                                if (release.sectionLabel) return releaseMarkup(release);
                                const releases = flatten(release);
                                return releases.reduce((rows, release, index) => {
                                    if (index % 3 === 0) rows.push([]);
                                    rows.at(-1).push(release);
                                    return rows;
                                }, []).map((row) => `<div class="security-update-mobile-row security-update-mobile-row--${row.length}">
                                    ${row.map(releaseMarkup).join("")}
                                </div>`).join("");
                            }).join("");
            
                            return `<section class="release-section${widthClass}">
                                <div class="security-update-desktop span-two">${desktopMarkup}</div>
                                <div class="security-update-mobile">${mobileMarkup}</div>
                            </section>`;
                        }).join("");
                    }
            
                    function renderTimeline() {
                        const timeline = timelines[versionSelect.value];
            
                        if (!timeline) {
                            releaseGrid.setAttribute("aria-label", "Timeline coming soon");
                            releaseGrid.innerHTML = '<p class="timeline-message span-two">This timeline is coming soon</p>';
                            timelineFootnote.hidden = true;
                            timelineFootnote.textContent = "";
                            return;
                        }
            
                        releaseGrid.setAttribute("aria-label", `${timeline.label} release dates`);
                        timelineFootnote.textContent = timeline.footnote ?? "";
                        timelineFootnote.hidden = !timeline.footnote;
                        if (timeline.gridMaxWidth) {
                            releaseGrid.style.setProperty("--timeline-grid-max-width", timeline.gridMaxWidth);
                        } else {
                            releaseGrid.style.removeProperty("--timeline-grid-max-width");
                        }
                        let markup = timeline.sectionedLayout
                            ? sectionedReleasesMarkup(timeline.releases)
                            : timeline.releases.map(releaseMarkup).join("");
            
                        if (timeline.supplemental?.length) {
                            markup += `<section class="span-two supplemental" aria-label="Supplemental releases">
                                <p class="section-label">supplemental releases</p>
                                ${timeline.supplemental.map(releaseMarkup).join("")}
                            </section>`;
                        }
            
                        releaseGrid.innerHTML = markup;
                    }
            
                    versionSelect.addEventListener("change", renderTimeline);
                    renderTimeline();
        },
        "os-x-10-11.html": () => {
            const timelines = {
                        "10-11": {
                            label: "OS X 10.11",
                            releases: [
                                { name: "OS X 10.11 beta 1", date: "June 8, 2015", alignment: "left" },
                                { name: "OS X 10.11 beta 2", date: "June 23, 2015", alignment: "right" },
                                { name: "OS X 10.11 beta 3", date: "July 8, 2015", alignment: "left" },
                                { name: "OS X 10.11 beta 4", date: "July 21, 2015", alignment: "right" },
                                { name: "OS X 10.11 beta 5", date: "July 27, 2015", alignment: "left" },
                                { name: "OS X 10.11 beta 6", date: "August 3, 2015", alignment: "right" },
                                { name: "OS X 10.11 beta 7", date: "August 19, 2015", alignment: "left" },
                                { name: "OS X 10.11 beta 8", date: "August 31, 2015", alignment: "right" },
                                {
                                    pair: [
                                        { name: "OS X 10.11 GM builds", date: "September 9, 2015" },
                                        { name: "OS X 10.11 final build", date: "September 30, 2015" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "10-11-1": {
                            label: "OS X 10.11.1",
                            releases: [
                                { name: "OS X 10.11.1 beta 1", date: "September 17, 2015", alignment: "left" },
                                { name: "OS X 10.11.1 beta 2", date: "September 29, 2015", alignment: "right" },
                                { name: "OS X 10.11.1 beta 4", date: "October 7, 2015", alignment: "left" },
                                { name: "OS X 10.11.1 beta 5", date: "October 14, 2015", alignment: "right" },
                                { name: "OS X 10.11.1 final build", date: "October 21, 2015", spanTwo: true }
                            ],
                        },
                        "10-11-2": {
                            label: "OS X 10.11.2",
                            releases: [
                                { name: "OS X 10.11.2 beta 1", date: "October 27, 2015", alignment: "left" },
                                { name: "OS X 10.11.2 beta 2", date: "November 3, 2015", alignment: "right" },
                                { name: "OS X 10.11.2 beta 3", date: "November 10, 2015", alignment: "left" },
                                { name: "OS X 10.11.2 beta 4", date: "November 17, 2015", alignment: "right" },
                                { name: "OS X 10.11.2 beta 5", date: "November 30, 2015", spanTwo: true },
                                { name: "OS X 10.11.2 final build", date: "December 8, 2015", spanTwo: true }
                            ],
                        },
                        "10-11-3": {
                            label: "OS X 10.11.3",
                            releases: [
                                { name: "OS X 10.11.3 beta 1", date: "December 16, 2015", alignment: "left" },
                                { name: "OS X 10.11.3 beta 2", date: "January 6, 2016", alignment: "right" },
                                { name: "OS X 10.11.3 final build", date: "January 19, 2016", spanTwo: true }
                            ],
                        },
                        "10-11-4": {
                            label: "OS X 10.11.4",
                            releases: [
                                { name: "OS X 10.11.4 beta 1", date: "January 11, 2016", alignment: "left" },
                                { name: "OS X 10.11.4 beta 2", date: "January 25, 2016", alignment: "right" },
                                { name: "OS X 10.11.4 beta 3", date: "February 8, 2016", note: "build 2: February 10, 2016", alignment: "left" },
                                { name: "OS X 10.11.4 beta 4", date: "February 22, 2016", alignment: "right" },
                                { name: "OS X 10.11.4 beta 5", date: "March 1, 2016", alignment: "left" },
                                { name: "OS X 10.11.4 beta 6", date: "March 7, 2016", alignment: "right" },
                                { name: "OS X 10.11.4 beta 7", date: "March 15, 2016", spanTwo: true },
                                { name: "OS X 10.11.4 final build", date: "March 21, 2016", spanTwo: true }
                            ],
                        },
                        "10-11-5": {
                            label: "OS X 10.11.5",
                            releases: [
                                { name: "OS X 10.11.5 beta 1", date: "April 6, 2016", alignment: "left" },
                                { name: "OS X 10.11.5 beta 2", date: "April 20, 2016", alignment: "right" },
                                { name: "OS X 10.11.5 beta 3", date: "April 27, 2016", alignment: "left" },
                                { name: "OS X 10.11.5 beta 4", date: "May 3, 2016", alignment: "right" },
                                { name: "OS X 10.11.5 final build", date: "May 16, 2016", spanTwo: true }
                            ],
                        },
                        "10-11-6": {
                            label: "OS X 10.11.6",
                            gridMaxWidth: "1310px",
                            sectionedLayout: true,
                            releases: [
                                { mainLabel: "Main Update" },
                                { name: "OS X 10.11.6 beta 1", date: "May 23, 2016", alignment: "left" },
                                { name: "OS X 10.11.6 beta 2", date: "June 7, 2016", alignment: "right" },
                                { name: "OS X 10.11.6 beta 3", date: "June 21, 2016", alignment: "left" },
                                { name: "OS X 10.11.6 beta 4", date: "June 29, 2016", alignment: "right" },
                                { name: "OS X 10.11.6 beta 5", date: "July 6, 2016", spanTwo: true },
                                { name: "OS X 10.11.6 final build", date: "July 18, 2016", spanTwo: true },
                                { name: "OS X 10.11.6 App Store Re-release", date: "September 20, 2016", spanTwo: true },
                                { name: "OS X 10.11.6 Snow Leopard Upgrade", date: "September 20, 2016", spanTwo: true },
                                { 
                                    sectionLabel: "Security Updates",
                                    sectionWidth: "wide",
                                    sectionLayout: "security-grid",
                                },
                                { 
                                    trio: [
                                        { date: "2016-001", note: "Final build: Sep 1, 2016" },
                                        { date: "2016-002", note: "beta 1: Sep 24, 2016\nFinal build: Oct 24, 2016" },
                                        { date: "2016-003", note: "beta 1: Oct 31, 2016\nbeta 2: Nov 8, 2016\nbeta 3: Nov 14, 2016\nbeta 4: Nov 28, 2016\nbeta 5: Dec 5, 2016\nFinal build: Dec 13, 2016" }
                                ],
                                className: "release-trio-tight",
                                securityFitContent: true
                                },
                                { 
                                    trio: [
                                        { date: "2017-001", note: "beta 3: Jan 24, 2017\nbeta 2: Feb 20, 2017\nbeta 3: Mar 7, 2017\nFinal build: Mar 27, 2017" },
                                        { date: "2017-002", note: "beta 1: Mar 28, 2017\nbeta 2: Apr 10, 2017\nbeta 3: Apr 17, 2017\nFinal build: May 15, 2017" },
                                        { date: "2017-003", note: "beta 1: May 16, 2017\nbeta 2: May 30, 2017\nbeta 3: Jun 13, 2017\nFinal build: Jul 19, 2017", },
                                ],
                                className: "release-trio-tight",
                                securityRow: "2021"
                                },
                                {
                                    pair: [
                                        { date: "2017-004", note: "beta 1: Sep 27, 2017\nbeta 2: Oct 9, 2017\nbeta 3: Oct 23, 2017\nFinal build: Oct 31, 2017" },
                                        { date: "2017-005", note: "beta 1: Oct 31, 2017\nbeta 2: Nov 6, 2017\nbeta 3: Nov 13, 2017\nFinal build: Dec 6, 2017" },
                                    ],
                                    className: "release-pair-tight",
                                    securityRow: "2021"
                                },
                                {
                                    pair: [
                                        { date: "2018-001", note: "beta 1: Jan 3, 2018\nbeta 2: Jan 9, 2018\nbeta 3: Jan 16, 2018\nbeta 4: Jan 19, 2018\nFinal build: Jan 23, 2018" },
                                        { date: "2018-002", note: "beta 1: Feb 6, 2018\nbeta 2: Mar 5, 2018\nFinal build: Mar 29, 2018" },
                                    ],
                                    className: "release-pair-tight",
                                    securityRow: "2022",
                                    securityFitContent: true
                                },
                                {
                                    pair: [
                                        { date: "2018-003", note: "beta 1: Apr 3, 2018\nbeta 2: Apr 17, 2018\nbeta 3: May 1, 2018\nFinal build: Jun 1, 2018", },                            
                                        { date: "2018-004", note: "beta 1: May 30, 2018\nbeta 2: Jun 11, 2018\nbeta 3: Jun 25, 2019\nbeta 4: Jul 2, 2018\nFinal build: Jul 9, 2018" },
                                    ],
                                    className: "release-pair-tight",
                                    securityRow: "2022",
                                    securityFitContent: true
                                },
                                { supplementalLabel: "Supplemental Updates" },
                                { date: "2016-003", note: "Supplemental Update: Jan 17, 2017" },
                            ],
                        },
                    };
            
                    const versionSelect = document.getElementById("software-version");
                    const releaseGrid = document.getElementById("release-grid");
                    const timelineFootnote = document.getElementById("timeline-footnote");
            
                    function releaseMarkup(release) {
                        if (release.mainLabel) {
                            return `<p class="section-label span-two">${release.mainLabel}</p>`;
                        }
            
                        if (release.supplementalLabel || release.sectionLabel) {
                            return `<p class="section-label section-label-divider span-two">${release.supplementalLabel ?? release.sectionLabel}</p>`;
                        }
            
                        if (release.trio) {
                            const className = release.className ? ` ${release.className}` : "";
                            return `<div class="release-trio${className}">${release.trio.map(releaseMarkup).join("")}</div>`;
                        }
            
                        if (release.quad) {
                            const className = release.className ? " " + release.className : "";
                            return `<div class="release-quad${className}">${release.quad.map(releaseMarkup).join("")}</div>`;
                        }
                        if (release.pair) {
                            const className = release.className ? ` ${release.className}` : "";
                            return `<div class="release-pair${className}">${release.pair.map(releaseMarkup).join("")}</div>`;
                        }
            
                        const spanClass = release.spanTwo ? " span-two" : "";
                        const alignmentClass = release.alignment ? ` release-align-${release.alignment}` : "";
                        const name = release.name ? `<p class="release-name">${release.name}</p>` : "";
                        const note = release.note ? `<p class="release-note">${release.note}</p>` : "";
                        return `<article class="release${spanClass}${alignmentClass}">
                            ${name}
                            <p class="release-date">${release.date}</p>${note}
                        </article>`;
                    }
            
                    function sectionedReleasesMarkup(releases) {
                        const sections = [{ width: "standard", layout: "default", releases: [] }];
            
                        releases.forEach((release) => {
                            if (release.sectionWidth === "wide" && sections.at(-1).releases.length) {
                                sections.push({
                                    width: "wide",
                                    layout: release.sectionLayout ?? "default",
                                    releases: []
                                });
                            }
                            sections.at(-1).releases.push(release);
                        });
            
                        return sections.map((section) => {
                            const widthClass = section.width === "wide" ? " release-section-wide" : "";
                            if (section.layout !== "security-grid") {
                                return `<section class="release-section${widthClass}">
                                    ${section.releases.map(releaseMarkup).join("")}
                                </section>`;
                            }
            
                            const flatten = (release) => {
                                if (release.pair) return release.pair.flatMap(flatten);
                                if (release.trio) return release.trio.flatMap(flatten);
                                if (release.quad) return release.quad.flatMap(flatten);
                                return [release];
                            };
                            const desktopRows = [];
            
                            section.releases.forEach((release) => {
                                if (release.sectionLabel) {
                                    desktopRows.push({ label: release });
                                    return;
                                }
                                const previousRow = desktopRows.at(-1);
                                if (release.securityRow && previousRow?.key === release.securityRow) {
                                    previousRow.releases.push(release);
                                    return;
                                }
                                desktopRows.push({ key: release.securityRow, releases: [release] });
                            });
            
                            const desktopMarkup = desktopRows.map((row) => {
                                if (row.label) return releaseMarkup(row.label);
                                const rowReleases = row.releases.flatMap(flatten);
                                const contentClass = row.releases.some((release) => release.securityFitContent)
                                    ? " security-update-row--content"
                                    : "";
                                return `<div class="security-update-row security-update-row--${rowReleases.length}${contentClass}" style="--security-update-count: ${rowReleases.length}">
                                    ${rowReleases.map(releaseMarkup).join("")}
                                </div>`;
                            }).join("");
            
                            const mobileMarkup = section.releases.map((release) => {
                                if (release.sectionLabel) return releaseMarkup(release);
                                const releases = flatten(release);
                                return releases.reduce((rows, release, index) => {
                                    if (index % 3 === 0) rows.push([]);
                                    rows.at(-1).push(release);
                                    return rows;
                                }, []).map((row) => `<div class="security-update-mobile-row security-update-mobile-row--${row.length}">
                                    ${row.map(releaseMarkup).join("")}
                                </div>`).join("");
                            }).join("");
            
                            return `<section class="release-section${widthClass}">
                                <div class="security-update-desktop span-two">${desktopMarkup}</div>
                                <div class="security-update-mobile">${mobileMarkup}</div>
                            </section>`;
                        }).join("");
                    }
            
                    function renderTimeline() {
                        const timeline = timelines[versionSelect.value];
            
                        if (!timeline) {
                            releaseGrid.setAttribute("aria-label", "Timeline coming soon");
                            releaseGrid.innerHTML = '<p class="timeline-message span-two">This timeline is coming soon</p>';
                            timelineFootnote.hidden = true;
                            timelineFootnote.textContent = "";
                            return;
                        }
            
                        releaseGrid.setAttribute("aria-label", `${timeline.label} release dates`);
                        timelineFootnote.textContent = timeline.footnote ?? "";
                        timelineFootnote.hidden = !timeline.footnote;
                        if (timeline.gridMaxWidth) {
                            releaseGrid.style.setProperty("--timeline-grid-max-width", timeline.gridMaxWidth);
                        } else {
                            releaseGrid.style.removeProperty("--timeline-grid-max-width");
                        }
                        let markup = timeline.sectionedLayout
                            ? sectionedReleasesMarkup(timeline.releases)
                            : timeline.releases.map(releaseMarkup).join("");
            
                        if (timeline.supplemental?.length) {
                            markup += `<section class="span-two supplemental" aria-label="Supplemental releases">
                                <p class="section-label">supplemental releases</p>
                                ${timeline.supplemental.map(releaseMarkup).join("")}
                            </section>`;
                        }
            
                        releaseGrid.innerHTML = markup;
                    }
            
                    versionSelect.addEventListener("change", renderTimeline);
                    renderTimeline();
        },
        "os-x-10-8.html": () => {
            const timelines = {
                        "10-8": {
                            label: "OS X 10.8",
                            releases: [
                                { name: "OS X 10.8 beta 1", date: "February 16, 2012", alignment: "left" },
                                { name: "OS X 10.8 beta 2", date: "March 16, 2012", alignment: "right" },
                                { name: "OS X 10.8 beta 3", date: "April 16, 2012", alignment: "left", note: "update: May 1, 2012\nupdate 2: May 16, 2012" },
                                { name: "OS X 10.8 beta 4", date: "June 11, 2012", alignment: "right", note: "update: June 19, 2012\nupdate 2: June 26, 2012" },
                                {
                                    pair: [
                                        { name: "OS X 10.8 GM build", date: "July 9, 2012" },
                                        { name: "OS X 10.8 final build", date: "July 25, 2012" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "10-8-1": {
                            label: "OS X 10.8.1",
                            releases: [
                                { name: "OS X 10.9.1 beta 1", date: "November 15, 2013", alignment: "left" },
                                { name: "OS X 10.9.1 beta 2", date: "November 21, 2013", alignment: "right" },
                                { name: "OS X 10.9.1 beta 3", date: "December 3, 2013", spanTwo: true },
                                { name: "OS X 10.9.1 final build", date: "December 16, 2013", spanTwo: true },
                            ],
                        },
                        "10-8-2": {
                            label: "OS X 10.8.2",
                            releases: [
                                { name: "OS X 10.9.2 beta 1", date: "December 19, 2013", alignment: "left" },
                                { name: "OS X 10.9.2 beta 2", date: "January 16, 2014", alignment: "right" },
                                { name: "OS X 10.9.2 beta 3", date: "January 23, 2014", alignment: "left" },
                                { name: "OS X 10.9.2 beta 4", date: "January 30, 2014", alignment: "right" },
                                { name: "OS X 10.9.2 beta 5", date: "February 6, 2014", alignment: "left" },
                                { name: "OS X 10.9.2 beta 6", date: "February 12, 2014", alignment: "right" },
                                { name: "OS X 10.9.2 beta 7", date: "February 17, 2014", spanTwo: true },
                                { name: "OS X 10.10.2 final build", date: "February 25, 2014", spanTwo: true },
                                { name: "OS X 10.10.2 (Security Update 2014-002)", date: "April 22, 2014" },
                            ],
                        },
                        "10-8-3": {
                            label: "OS X 10.8.3",
                            releases: [
                                { name: "OS X 10.9.3 beta 1", date: "March 6, 2014", alignment: "left" },
                                { name: "OS X 10.9.3 beta 2", date: "March 13, 2014", alignment: "right" },
                                { name: "OS X 10.9.3 beta 3", date: "March 20, 2014", alignment: "left" },
                                { name: "OS X 10.9.3 beta 4", date: "March 28, 2014", alignment: "right" },
                                { name: "OS X 10.9.3 beta 5", date: "April 3, 2014", alignment: "left" },
                                { name: "OS X 10.9.3 beta 6", date: "April 9, 2014", alignment: "right" }, 
                                { name: "OS X 10.9.3 beta 7", date: "April 15, 2014", alignment: "left" },
                                { name: "OS X 10.9.3 beta 8", date: "April 21, 2014", alignment: "right" }, 
                                { name: "OS X 10.9.3 beta 9", date: "April 29, 2014", alignment: "left" },
                                { name: "OS X 10.9.3 beta 10", date: "May 7, 2014", alignment: "right" },                 
                                { name: "OS X 10.9.3 final build", date: "May 15, 2014", spanTwo: true }
                            ],
                        },
                        "10-9-4": {
                            label: "OS X 10.8.4",
                            releases: [
                                { name: "OS X 10.9.4 beta 1", date: "May 28, 2014", alignment: "left" },
                                { name: "OS X 10.9.4 beta 2", date: "June 11, 2014", alignment: "right" },
                                { name: "OS X 10.9.4 beta 3", date: "June 19, 2014", alignment: "left" },
                                { name: "OS X 10.9.4 beta 4", date: "June 25, 2014", alignment: "right" },
                                { name: "OS X 10.9.4 final build", date: "June 30, 2014", spanTwo: true }
                            ],
                        },
                        "10-8-5": {
                            label: "OS X 10.8.5",
                            gridMaxWidth: "1310px",
                            sectionedLayout: true,
                            releases: [
                                { mainLabel: "Main Update" },
                                { name: "OS X 10.9.5 beta 1", date: "July 30, 2014", alignment: "left" },
                                { name: "OS X 10.9.5 beta 2", date: "August 7, 2014", alignment: "right" },
                                { name: "OS X 10.9.5 beta 3", date: "August 13, 2014", alignment: "left" },
                                { name: "OS X 10.9.5 beta 4", date: "August 19, 2014", alignment: "right" },
                                { name: "OS X 10.9.5 beta 5", date: "August 27, 2014", note: "build 2: August 28, 2014", alignment: "left" },
                                { name: "OS X 10.9.5 beta 6", date: "September 5, 2014", alignment: "right" },                                        
                                { name: "OS X 10.9.5 final build", date: "September 17, 2014", spanTwo: true },
                                { name: "OS X 10.9.5 (Security Update 2014-005)", date: "October 16, 2014", spanTwo: true },
                                { name: "OS X 10.9.5 NTP Update", date: "December 22, 2014", spanTwo: true },
                                { 
                                    sectionLabel: "Security Updates",
                                    sectionWidth: "wide",
                                    sectionLayout: "security-grid",
                                },
                                { 
                                    quad: [
                                        { date: "2015-001", note: "Final build: Jan 27, 2015" },
                                        { date: "2015-002", note: "Final build: Mar 9, 2015" },
                                        { date: "2015-004", note: "Final build: Apr 8, 2015", },
                                        { date: "2015-005", note: "Final build: Jun 30, 2015" },
                                ],
                                className: "release-quad-tight",
                                securityRow: "2021"
                                },
                                {
                                    trio: [
                                        { date: "2015-006", note: "Final build: Aug 13, 2015" },
                                        { date: "2015-007", note: "Final build: Oct 21, 2015" },
                                        { date: "2015-008", note: "Final build: Dec 8, 2015" },
                                    ],
                                    className: "release-trio-tight",
                                    securityRow: "2021"
                                },
                                {
                                    quad: [
                                        { date: "2016-001", note: "Final build: Jan 19, 2016" },
                                        { date: "2016-002", note: "Final build: Mar 21, 2016" },
                                        { date: "2016-003", note: "Final build: May 16, 2016", },
                                        { date: "2016-004", note: "Final build: Jul 18, 2016" },
                                    ],
                                    className: "release-quad-tight",
                                    securityRow: "2022"
                                },
                            ],
                        },
                    };
            
                    const versionSelect = document.getElementById("software-version");
                    const releaseGrid = document.getElementById("release-grid");
                    const timelineFootnote = document.getElementById("timeline-footnote");
            
                    function releaseMarkup(release) {
                        if (release.mainLabel) {
                            return `<p class="section-label span-two">${release.mainLabel}</p>`;
                        }
            
                        if (release.supplementalLabel || release.sectionLabel) {
                            return `<p class="section-label section-label-divider span-two">${release.supplementalLabel ?? release.sectionLabel}</p>`;
                        }
            
                        if (release.trio) {
                            const className = release.className ? ` ${release.className}` : "";
                            return `<div class="release-trio${className}">${release.trio.map(releaseMarkup).join("")}</div>`;
                        }
            
                        if (release.quad) {
                            const className = release.className ? " " + release.className : "";
                            return `<div class="release-quad${className}">${release.quad.map(releaseMarkup).join("")}</div>`;
                        }
                        if (release.pair) {
                            const className = release.className ? ` ${release.className}` : "";
                            return `<div class="release-pair${className}">${release.pair.map(releaseMarkup).join("")}</div>`;
                        }
            
                        const spanClass = release.spanTwo ? " span-two" : "";
                        const alignmentClass = release.alignment ? ` release-align-${release.alignment}` : "";
                        const name = release.name ? `<p class="release-name">${release.name}</p>` : "";
                        const note = release.note ? `<p class="release-note">${release.note}</p>` : "";
                        return `<article class="release${spanClass}${alignmentClass}">
                            ${name}
                            <p class="release-date">${release.date}</p>${note}
                        </article>`;
                    }
            
                    function sectionedReleasesMarkup(releases) {
                        const sections = [{ width: "standard", layout: "default", releases: [] }];
            
                        releases.forEach((release) => {
                            if (release.sectionWidth === "wide" && sections.at(-1).releases.length) {
                                sections.push({
                                    width: "wide",
                                    layout: release.sectionLayout ?? "default",
                                    releases: []
                                });
                            }
                            sections.at(-1).releases.push(release);
                        });
            
                        return sections.map((section) => {
                            const widthClass = section.width === "wide" ? " release-section-wide" : "";
                            if (section.layout !== "security-grid") {
                                return `<section class="release-section${widthClass}">
                                    ${section.releases.map(releaseMarkup).join("")}
                                </section>`;
                            }
            
                            const flatten = (release) => {
                                if (release.pair) return release.pair.flatMap(flatten);
                                if (release.trio) return release.trio.flatMap(flatten);
                                if (release.quad) return release.quad.flatMap(flatten);
                                return [release];
                            };
                            const desktopRows = [];
            
                            section.releases.forEach((release) => {
                                if (release.sectionLabel) {
                                    desktopRows.push({ label: release });
                                    return;
                                }
                                const previousRow = desktopRows.at(-1);
                                if (release.securityRow && previousRow?.key === release.securityRow) {
                                    previousRow.releases.push(release);
                                    return;
                                }
                                desktopRows.push({ key: release.securityRow, releases: [release] });
                            });
            
                            const desktopMarkup = desktopRows.map((row) => {
                                if (row.label) return releaseMarkup(row.label);
                                const rowReleases = row.releases.flatMap(flatten);
                                const contentClass = row.releases.some((release) => release.securityFitContent)
                                    ? " security-update-row--content"
                                    : "";
                                return `<div class="security-update-row security-update-row--${rowReleases.length}${contentClass}" style="--security-update-count: ${rowReleases.length}">
                                    ${rowReleases.map(releaseMarkup).join("")}
                                </div>`;
                            }).join("");
                            const mobileMarkup = section.releases.map((release) => {
                                if (release.sectionLabel) return releaseMarkup(release);
                                const releases = flatten(release);
                                return releases.reduce((rows, release, index) => {
                                    if (index % 3 === 0) rows.push([]);
                                    rows.at(-1).push(release);
                                    return rows;
                                }, []).map((row) => `<div class="security-update-mobile-row security-update-mobile-row--${row.length}">
                                    ${row.map(releaseMarkup).join("")}
                                </div>`).join("");
                            }).join("");
            
                            return `<section class="release-section${widthClass}">
                                <div class="security-update-desktop span-two">${desktopMarkup}</div>
                                <div class="security-update-mobile">${mobileMarkup}</div>
                            </section>`;
                        }).join("");
                    }
            
                    function renderTimeline() {
                        const timeline = timelines[versionSelect.value];
            
                        if (!timeline) {
                            releaseGrid.setAttribute("aria-label", "Timeline coming soon");
                            releaseGrid.innerHTML = '<p class="timeline-message span-two">This timeline is coming soon</p>';
                            timelineFootnote.hidden = true;
                            timelineFootnote.textContent = "";
                            return;
                        }
            
                        releaseGrid.setAttribute("aria-label", `${timeline.label} release dates`);
                        timelineFootnote.textContent = timeline.footnote ?? "";
                        timelineFootnote.hidden = !timeline.footnote;
                        if (timeline.gridMaxWidth) {
                            releaseGrid.style.setProperty("--timeline-grid-max-width", timeline.gridMaxWidth);
                        } else {
                            releaseGrid.style.removeProperty("--timeline-grid-max-width");
                        }
                        let markup = timeline.sectionedLayout
                            ? sectionedReleasesMarkup(timeline.releases)
                            : timeline.releases.map(releaseMarkup).join("");
            
                        if (timeline.supplemental?.length) {
                            markup += `<section class="span-two supplemental" aria-label="Supplemental releases">
                                <p class="section-label">supplemental releases</p>
                                ${timeline.supplemental.map(releaseMarkup).join("")}
                            </section>`;
                        }
            
                        releaseGrid.innerHTML = markup;
                    }
            
                    versionSelect.addEventListener("change", renderTimeline);
                    renderTimeline();
        },        
        "os-x-10-9.html": () => {
            const timelines = {
                        "10-9": {
                            label: "OS X 10.9",
                            releases: [
                                { name: "OS X 10.9 beta 1", date: "June 10, 2013", alignment: "left" },
                                { name: "OS X 10.9 beta 2", date: "June 24, 2013", alignment: "right" },
                                { name: "OS X 10.9 beta 3", date: "July 8, 2013", alignment: "left" },
                                { name: "OS X 10.9 beta 4", date: "July 22, 2013", alignment: "right" },
                                { name: "OS X 10.9 beta 5", date: "August 7, 2013", alignment: "left" },
                                { name: "OS X 10.9 beta 6", date: "August 21, 2013", alignment: "right" },
                                { name: "OS X 10.9 beta 7", date: "September 3, 2013", alignment: "left" },
                                { name: "OS X 10.9 beta 8", date: "September 16, 2013", alignment: "right" },
                                {
                                    pair: [
                                        { name: "OS X 10.9 GM build", date: "October 3, 2013", note: "build 2: October 18, 2013" },
                                        { name: "OS X 10.9 final build", date: "October 22, 2013" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "10-9-1": {
                            label: "OS X 10.10.1",
                            releases: [
                                { name: "OS X 10.9.1 beta 1", date: "November 15, 2013", alignment: "left" },
                                { name: "OS X 10.9.1 beta 2", date: "November 21, 2013", alignment: "right" },
                                { name: "OS X 10.9.1 beta 3", date: "December 3, 2013", spanTwo: true },
                                { name: "OS X 10.9.1 final build", date: "December 16, 2013", spanTwo: true },
                            ],
                        },
                        "10-9-2": {
                            label: "OS X 10.9.2",
                            releases: [
                                { name: "OS X 10.9.2 beta 1", date: "December 19, 2013", alignment: "left" },
                                { name: "OS X 10.9.2 beta 2", date: "January 16, 2014", alignment: "right" },
                                { name: "OS X 10.9.2 beta 3", date: "January 23, 2014", alignment: "left" },
                                { name: "OS X 10.9.2 beta 4", date: "January 30, 2014", alignment: "right" },
                                { name: "OS X 10.9.2 beta 5", date: "February 6, 2014", alignment: "left" },
                                { name: "OS X 10.9.2 beta 6", date: "February 12, 2014", alignment: "right" },
                                { name: "OS X 10.9.2 beta 7", date: "February 17, 2014", spanTwo: true },
                                { name: "OS X 10.10.2 final build", date: "February 25, 2014", spanTwo: true },
                                { name: "OS X 10.10.2 (Security Update 2014-002)", date: "April 22, 2014" },
                            ],
                        },
                        "10-9-3": {
                            label: "OS X 10.9.3",
                            releases: [
                                { name: "OS X 10.9.3 beta 1", date: "March 6, 2014", alignment: "left" },
                                { name: "OS X 10.9.3 beta 2", date: "March 13, 2014", alignment: "right" },
                                { name: "OS X 10.9.3 beta 3", date: "March 20, 2014", alignment: "left" },
                                { name: "OS X 10.9.3 beta 4", date: "March 28, 2014", alignment: "right" },
                                { name: "OS X 10.9.3 beta 5", date: "April 3, 2014", alignment: "left" },
                                { name: "OS X 10.9.3 beta 6", date: "April 9, 2014", alignment: "right" }, 
                                { name: "OS X 10.9.3 beta 7", date: "April 15, 2014", alignment: "left" },
                                { name: "OS X 10.9.3 beta 8", date: "April 21, 2014", alignment: "right" }, 
                                { name: "OS X 10.9.3 beta 9", date: "April 29, 2014", alignment: "left" },
                                { name: "OS X 10.9.3 beta 10", date: "May 7, 2014", alignment: "right" },                 
                                { name: "OS X 10.9.3 final build", date: "May 15, 2014", spanTwo: true }
                            ],
                        },
                        "10-9-4": {
                            label: "OS X 10.9.4",
                            releases: [
                                { name: "OS X 10.9.4 beta 1", date: "May 28, 2014", alignment: "left" },
                                { name: "OS X 10.9.4 beta 2", date: "June 11, 2014", alignment: "right" },
                                { name: "OS X 10.9.4 beta 3", date: "June 19, 2014", alignment: "left" },
                                { name: "OS X 10.9.4 beta 4", date: "June 25, 2014", alignment: "right" },
                                { name: "OS X 10.9.4 final build", date: "June 30, 2014", spanTwo: true }
                            ],
                        },
                        "10-9-5": {
                            label: "OS X 10.9.5",
                            gridMaxWidth: "1310px",
                            sectionedLayout: true,
                            releases: [
                                { mainLabel: "Main Update" },
                                { name: "OS X 10.9.5 beta 1", date: "July 30, 2014", alignment: "left" },
                                { name: "OS X 10.9.5 beta 2", date: "August 7, 2014", alignment: "right" },
                                { name: "OS X 10.9.5 beta 3", date: "August 13, 2014", alignment: "left" },
                                { name: "OS X 10.9.5 beta 4", date: "August 19, 2014", alignment: "right" },
                                { name: "OS X 10.9.5 beta 5", date: "August 27, 2014", note: "build 2: August 28, 2014", alignment: "left" },
                                { name: "OS X 10.9.5 beta 6", date: "September 5, 2014", alignment: "right" },                                        
                                { name: "OS X 10.9.5 final build", date: "September 17, 2014", spanTwo: true },
                                { name: "OS X 10.9.5 (Security Update 2014-005)", date: "October 16, 2014", spanTwo: true },
                                { name: "OS X 10.9.5 NTP Update", date: "December 22, 2014", spanTwo: true },
                                { 
                                    sectionLabel: "Security Updates",
                                    sectionWidth: "wide",
                                    sectionLayout: "security-grid",
                                },
                                { 
                                    quad: [
                                        { date: "2015-001", note: "Final build: Jan 27, 2015" },
                                        { date: "2015-002", note: "Final build: Mar 9, 2015" },
                                        { date: "2015-004", note: "Final build: Apr 8, 2015", },
                                        { date: "2015-005", note: "Final build: Jun 30, 2015" },
                                ],
                                className: "release-quad-tight",
                                securityRow: "2021"
                                },
                                {
                                    trio: [
                                        { date: "2015-006", note: "Final build: Aug 13, 2015" },
                                        { date: "2015-007", note: "Final build: Oct 21, 2015" },
                                        { date: "2015-008", note: "Final build: Dec 8, 2015" },
                                    ],
                                    className: "release-trio-tight",
                                    securityRow: "2021"
                                },
                                {
                                    quad: [
                                        { date: "2016-001", note: "Final build: Jan 19, 2016" },
                                        { date: "2016-002", note: "Final build: Mar 21, 2016" },
                                        { date: "2016-003", note: "Final build: May 16, 2016", },
                                        { date: "2016-004", note: "Final build: Jul 18, 2016" },
                                    ],
                                    className: "release-quad-tight",
                                    securityRow: "2022"
                                },
                            ],
                        },
                    };
            
                    const versionSelect = document.getElementById("software-version");
                    const releaseGrid = document.getElementById("release-grid");
                    const timelineFootnote = document.getElementById("timeline-footnote");
            
                    function releaseMarkup(release) {
                        if (release.mainLabel) {
                            return `<p class="section-label span-two">${release.mainLabel}</p>`;
                        }
            
                        if (release.supplementalLabel || release.sectionLabel) {
                            return `<p class="section-label section-label-divider span-two">${release.supplementalLabel ?? release.sectionLabel}</p>`;
                        }
            
                        if (release.trio) {
                            const className = release.className ? ` ${release.className}` : "";
                            return `<div class="release-trio${className}">${release.trio.map(releaseMarkup).join("")}</div>`;
                        }
            
                        if (release.quad) {
                            const className = release.className ? " " + release.className : "";
                            return `<div class="release-quad${className}">${release.quad.map(releaseMarkup).join("")}</div>`;
                        }
                        if (release.pair) {
                            const className = release.className ? ` ${release.className}` : "";
                            return `<div class="release-pair${className}">${release.pair.map(releaseMarkup).join("")}</div>`;
                        }
            
                        const spanClass = release.spanTwo ? " span-two" : "";
                        const alignmentClass = release.alignment ? ` release-align-${release.alignment}` : "";
                        const name = release.name ? `<p class="release-name">${release.name}</p>` : "";
                        const note = release.note ? `<p class="release-note">${release.note}</p>` : "";
                        return `<article class="release${spanClass}${alignmentClass}">
                            ${name}
                            <p class="release-date">${release.date}</p>${note}
                        </article>`;
                    }
            
                    function sectionedReleasesMarkup(releases) {
                        const sections = [{ width: "standard", layout: "default", releases: [] }];
            
                        releases.forEach((release) => {
                            if (release.sectionWidth === "wide" && sections.at(-1).releases.length) {
                                sections.push({
                                    width: "wide",
                                    layout: release.sectionLayout ?? "default",
                                    releases: []
                                });
                            }
                            sections.at(-1).releases.push(release);
                        });
            
                        return sections.map((section) => {
                            const widthClass = section.width === "wide" ? " release-section-wide" : "";
                            if (section.layout !== "security-grid") {
                                return `<section class="release-section${widthClass}">
                                    ${section.releases.map(releaseMarkup).join("")}
                                </section>`;
                            }
            
                            const flatten = (release) => {
                                if (release.pair) return release.pair.flatMap(flatten);
                                if (release.trio) return release.trio.flatMap(flatten);
                                if (release.quad) return release.quad.flatMap(flatten);
                                return [release];
                            };
                            const desktopRows = [];
            
                            section.releases.forEach((release) => {
                                if (release.sectionLabel) {
                                    desktopRows.push({ label: release });
                                    return;
                                }
                                const previousRow = desktopRows.at(-1);
                                if (release.securityRow && previousRow?.key === release.securityRow) {
                                    previousRow.releases.push(release);
                                    return;
                                }
                                desktopRows.push({ key: release.securityRow, releases: [release] });
                            });
            
                            const desktopMarkup = desktopRows.map((row) => {
                                if (row.label) return releaseMarkup(row.label);
                                const rowReleases = row.releases.flatMap(flatten);
                                const contentClass = row.releases.some((release) => release.securityFitContent)
                                    ? " security-update-row--content"
                                    : "";
                                return `<div class="security-update-row security-update-row--${rowReleases.length}${contentClass}" style="--security-update-count: ${rowReleases.length}">
                                    ${rowReleases.map(releaseMarkup).join("")}
                                </div>`;
                            }).join("");
                            const mobileMarkup = section.releases.map((release) => {
                                if (release.sectionLabel) return releaseMarkup(release);
                                const releases = flatten(release);
                                return releases.reduce((rows, release, index) => {
                                    if (index % 3 === 0) rows.push([]);
                                    rows.at(-1).push(release);
                                    return rows;
                                }, []).map((row) => `<div class="security-update-mobile-row security-update-mobile-row--${row.length}">
                                    ${row.map(releaseMarkup).join("")}
                                </div>`).join("");
                            }).join("");
            
                            return `<section class="release-section${widthClass}">
                                <div class="security-update-desktop span-two">${desktopMarkup}</div>
                                <div class="security-update-mobile">${mobileMarkup}</div>
                            </section>`;
                        }).join("");
                    }
            
                    function renderTimeline() {
                        const timeline = timelines[versionSelect.value];
            
                        if (!timeline) {
                            releaseGrid.setAttribute("aria-label", "Timeline coming soon");
                            releaseGrid.innerHTML = '<p class="timeline-message span-two">This timeline is coming soon</p>';
                            timelineFootnote.hidden = true;
                            timelineFootnote.textContent = "";
                            return;
                        }
            
                        releaseGrid.setAttribute("aria-label", `${timeline.label} release dates`);
                        timelineFootnote.textContent = timeline.footnote ?? "";
                        timelineFootnote.hidden = !timeline.footnote;
                        if (timeline.gridMaxWidth) {
                            releaseGrid.style.setProperty("--timeline-grid-max-width", timeline.gridMaxWidth);
                        } else {
                            releaseGrid.style.removeProperty("--timeline-grid-max-width");
                        }
                        let markup = timeline.sectionedLayout
                            ? sectionedReleasesMarkup(timeline.releases)
                            : timeline.releases.map(releaseMarkup).join("");
            
                        if (timeline.supplemental?.length) {
                            markup += `<section class="span-two supplemental" aria-label="Supplemental releases">
                                <p class="section-label">supplemental releases</p>
                                ${timeline.supplemental.map(releaseMarkup).join("")}
                            </section>`;
                        }
            
                        releaseGrid.innerHTML = markup;
                    }
            
                    versionSelect.addEventListener("change", renderTimeline);
                    renderTimeline();
        },
        "tvos-10.html": () => {
            const timelines = {
                        "10-0": {
                            label: "tvOS 10.0",
                            releases: [
                                { name: "tvOS 10.0 beta 1", date: "June 13, 2016", alignment: "left" },
                                { name: "tvOS 10.0 beta 2", date: "July 5, 2016", alignment: "right" },
                                { name: "tvOS 10.0 beta 3", date: "July 18, 2016", alignment: "left" },
                                { name: "tvOS 10.0 beta 4", date: "August 1, 2016", alignment: "right" },
                                { name: "tvOS 10.0 beta 5", date: "August 9, 2016", alignment: "left" },
                                { name: "tvOS 10.0 beta 6", date: "August 15, 2016", alignment: "right" },
                                { name: "tvOS 10.0 beta 7", date: "August 26, 2016", spanTwo: true },
                                {
                                    pair: [
                                        { name: "tvOS 10.0 GM build", date: "September 7, 2016" },
                                        { name: "tvOS 10.0 final build", date: "September 13, 2016" },
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { date: "tvOS 10.0.1", note: "beta 1: Sep 21, 2016\nbeta 2: Oct 4, 2016\nbeta 3: Oct 10, 2016\nbeta 4: Oct 20, 2016\nFinal build: Oct 24, 2016\nFinal build 2: Nov 14, 2016" },
                            ]
                        },
                        "10-1-x": {
                            label: "tvOS 10.1.x",
                            releases: [
                                { name: "tvOS 10.1 beta 1", date: "October 31, 2016", alignment: "left" },
                                { name: "tvOS 10.1 beta 2", date: "November 7, 2016", alignment: "right" },
                                { name: "tvOS 10.1 beta 3", date: "November 14, 2016", alignment: "left" },
                                { name: "tvOS 10.2 beta 4", date: "November 30, 2016", alignment: "right" },
                                { name: "tvOS 10.2 beta 5", date: "December 6, 2016", spanTwo: true },
                                { name: "tvOS 10.2 final build", date: "December 12, 2016", spanTwo: true },                 
                            ],
                            supplemental: [
                                { date: "tvOS 10.1.1", note: "beta 1: Dec 14, 2016\nbeta 2: Jan 9, 2017\nFinal build: Jan 23, 2017" }
                            ]
                        },
                        "10-2-x": {
                            label: "tvOS 10.2.x",
                            releases: [
                                { name: "tvOS 10.3 beta 1", date: "January 24, 2017", alignment: "left" },
                                { name: "tvOS 10.3 beta 2", date: "February 6, 2017", alignment: "right" },
                                { name: "tvOS 10.3 beta 3", date: "February 20, 2017", alignment: "left" },
                                { name: "tvOS 10.3 beta 4", date: "February 28, 2017", alignment: "right" },
                                { name: "tvOS 10.3 beta 5", date: "March 8, 2017", alignment: "left" },
                                { name: "tvOS 10.3 beta 6", date: "March 14, 2017", alignment: "right" },
                                { name: "tvOS 10.3 final build", date: "March 27, 2017", spanTwo: true }
                            ],
                            supplemental: [
                                {
                                    pair: [
                                        { date: "tvOS 10.2.1", note: "beta 1: Mar 28, 2017\nbeta 2: Apr 10, 2017\nbeta 3: Apr 17, 2017\nbeta 4: Apr 24, 2017\nbeta 5: May 4, 2017\nFinal build: May 15, 2017" },
                                        { date: "tvOS 10.2.2", note: "beta 1: May 16, 2017\nbeta 2: May 30, 2017\nbeta 3: Jun 13, 2017\nbeta 4: Jun 22, 2017\nbeta 5: Jul 6, 2017\nFinal build: Jul 19, 2017" },
                                    ],
                                    className: "release-pair-tight"
                                }
                            ]
                        },
                    };
            initializeTimelinePage(timelines);
        },
        "tvos-11.html": () => {
            const timelines = {
                        "11-0": {
                            label: "tvOS 11.0",
                            releases: [
                                { name: "tvOS 11.0 beta 1", date: "June 5, 2017", note: "build 2: June 7, 2017", alignment: "left" },
                                { name: "tvOS 11.0 beta 2", date: "June 21, 2017", note: "build 2: June 26, 2017", alignment: "right" },
                                { name: "tvOS 11.0 beta 3", date: "July 10, 2017", alignment: "left" },
                                { name: "tvOS 11.0 beta 4", date: "July 24, 2017", alignment: "right" },
                                { name: "tvOS 11.0 beta 5", date: "August 7, 2017", alignment: "left" },
                                { name: "tvOS 11.0 beta 6", date: "August 14, 2017", alignment: "right" },
                                { name: "tvOS 11.0 beta 7", date: "August 21, 2017", alignment: "left" },
                                { name: "tvOS 11.0 beta 8", date: "August 28, 2017", alignment: "right" },
                                { name: "tvOS 11.0 beta 9", date: "August 31, 2017", alignment: "left" },
                                { name: "tvOS 11.0 beta 10", date: "September 6, 2017", alignment: "right" },
                                {
                                    pair: [
                                        { name: "tvOS 11.0 GM build", date: "September 12, 2017" },
                                        { name: "tvOS 11.0 final build", date: "September 19, 2017" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "11-1": {
                            label: "tvOS 11.1",
                            releases: [
                                { name: "tvOS 11.1 beta 1", date: "September 27, 2017", alignment: "left" },
                                { name: "tvOS 11.1 beta 2", date: "October 9, 2017", alignment: "right" },
                                { name: "tvOS 11.1 beta 3", date: "October 16, 2017", alignment: "left" },
                                { name: "tvOS 11.1 beta 4", date: "October 23, 2017", alignment: "right" },
                                { name: "tvOS 11.1 final build", date: "October 31, 2017", spanTwo: true }
                            ],
                        },
                        "11-2": {
                            label: "tvOS 11.2",
                            releases: [
                                { name: "tvOS 11.2 beta 1", date: "October 30, 2017", alignment: "left" },
                                { name: "tvOS 11.2 beta 2", date: "November 6, 2017", alignment: "right" },
                                { name: "tvOS 11.2 beta 3", date: "November 13, 2017", alignment: "left" },
                                { name: "tvOS 11.2 beta 4", date: "November 17, 2017", alignment: "right" },
                                { name: "tvOS 11.2 beta 5", date: "November 28, 2017", spanTwo: true },
                                { name: "tvOS 11.2 final build", date: "December 4, 2017", spanTwo: true },
                            ],
                            supplemental: [
                                {
                                    trio: [
                                        { date: "tvOS 11.2.1", note: "Final build: Dec 13, 2017" },
                                        { date: "tvOS 11.2.5", note: "beta 1: Dec 13, 2017\nbeta 2: Dec 19, 2017\nbeta 3: Jan 3, 2018\nbeta 4: Jan 9, 2018\nbeta 5: Jan 12, 2018\nbeta 6: Jan 17, 2018\nFinal build: Jan 23, 2018" },
                                        { date: "tvOS 11.2.6", note: "Final build: Feb 19, 2018" },
                                    ],
                                    className: "release-trio-tight"
                                }
                            ]
                        },
                        "11-3": {
                            label: "tvOS 11.3",
                            releases: [
                                { name: "tvOS 11.3 beta 1", date: "January 24, 2018", alignment: "left" },
                                { name: "tvOS 11.3 beta 2", date: "February 6, 2018", alignment: "right" },
                                { name: "tvOS 11.3 beta 3", date: "February 20, 2018", alignment: "left" },
                                { name: "tvOS 11.3 beta 4", date: "March 5, 2018", alignment: "right" },
                                { name: "tvOS 11.3 beta 5", date: "March 12, 2018", alignment: "left" },
                                { name: "tvOS 11.3 beta 6", date: "March 20, 2018", alignment: "right" },
                                { name: "tvOS 11.3 final build", date: "March 29, 2018", spanTwo: true }
                            ],
                        },
                        "11-4": {
                            label: "tvOS 11.4",
                            releases: [
                                { name: "tvOS 11.4 beta 1", date: "April 2, 2018", alignment: "left" },
                                { name: "tvOS 11.4 beta 2", date: "April 16, 2018", alignment: "right" },
                                { name: "tvOS 11.4 beta 3", date: "May 1, 2018", alignment: "left" },
                                { name: "tvOS 11.4 beta 4", date: "May 7, 2018", alignment: "right" },
                                { name: "tvOS 11.4 beta 5", date: "May 14, 2018", spanTwo: true },
                                { name: "tvOS 11.4 final build", date: "May 29, 2018", spanTwo: true }
                            ]
                        },
                        "11-4-1": {
                            label: "tvOS 11.4.1",
                            releases: [
                                { name: "tvOS 11.4.1 beta 1", date: "May 30, 2018", alignment: "left" },
                                { name: "tvOS 11.4.1 beta 2", date: "June 11, 2018", alignment: "right" },
                                { name: "tvOS 11.4.1 beta 3", date: "June 18, 2018", alignment: "left" },
                                { name: "tvOS 11.4.1 beta 4", date: "June 25, 2018", alignment: "right" },
                                { name: "tvOS 11.4.1 final build", date: "July 9, 2018", spanTwo: true }
                            ]
                        }
                    };
            initializeTimelinePage(timelines);
        },
        "tvos-12.html": () => {
            const timelines = {
                        "12-0": {
                            label: "tvOS 12.0",
                            releases: [
                                { name: "tvOS 12.0 beta 1", date: "June 4, 2018", alignment: "left" },
                                { name: "tvOS 12.0 beta 2", date: "June 19, 2018", alignment: "right" },
                                { name: "tvOS 12.0 beta 3", date: "July 3, 2018", alignment: "left" },
                                { name: "tvOS 12.0 beta 4", date: "July 17, 2018", alignment: "right" },
                                { name: "tvOS 12.0 beta 5", date: "July 30, 2018", alignment: "left" },
                                { name: "tvOS 12.0 beta 6", date: "August 6, 2018", alignment: "right" },
                                { name: "tvOS 12.0 beta 7", date: "August 13, 2018", alignment: "left" },
                                { name: "tvOS 12.0 beta 8", date: "August 20, 2018", alignment: "right" },
                                { name: "tvOS 12.0 beta 9", date: "August 27, 2018", alignment: "left" },
                                { name: "tvOS 12.0 beta 10", date: "August 31, 2018", alignment: "right" },
                                {
                                    pair: [
                                        { name: "tvOS 12.0 GM build", date: "September 12, 2018" },
                                        { name: "tvOS 12.0 final build", date: "September 17, 2018" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "tvOS 12.0.1", date: "September 24, 2018" }
                            ]
                        },
                        "12-1": {
                            label: "tvOS 12.1",
                            releases: [
                                { name: "tvOS 12.1 beta 1", date: "September 18, 2018", alignment: "left" },
                                { name: "tvOS 12.1 beta 2", date: "October 2, 2018", alignment: "right" },
                                { name: "tvOS 12.1 beta 3", date: "October 9, 2018", alignment: "left" },
                                { name: "tvOS 12.1 beta 4", date: "October 15, 2018", alignment: "right" },
                                { name: "tvOS 12.1 beta 5", date: "October 23, 2018", spanTwo: true },
                                { name: "tvOS 12.1 final build", date: "October 30, 2018", spanTwo: true}
                            ]
                        },
                        "12-1-1": {
                            label: "tvOS 12.1.1",
                            releases: [
                                { name: "tvOS 12.1.1 beta 1", date: "October 31, 2018", alignment: "left" },
                                { name: "tvOS 12.1.1 beta 2", date: "November 7, 2018", alignment: "right" },
                                { name: "tvOS 12.1.1 beta 3", date: "November 15, 2018", alignment: "left" },
                                { name: "tvOS 12.1.1 beta 4", date: "November 29, 2018", alignment: "right" },
                                { name: "tvOS 12.1.1 final build", date: "December 5, 2018", spanTwo: true }
                            ],
                            supplemental: [
                                { date: "tvOS 12.1.2", note: "beta 1: Dec 10, 2018\nbeta 2: Dec 19, 2018\nbeta 3: Jan 7, 2019\nFinal build: Jan 22, 2019" }
                            ]
                        },
                        "12-2": {
                            label: "tvOS 12.2",
                            releases: [
                                { name: "tvOS 12.2 beta 1", date: "January 24, 2019", alignment: "left" },
                                { name: "tvOS 12.2 beta 2", date: "February 4, 2019", alignment: "right" },
                                { name: "tvOS 12.2 beta 3", date: "February 19, 2019", alignment: "left" },
                                { name: "tvOS 12.2 beta 4", date: "March 4, 2019", alignment: "right" },
                                { name: "tvOS 12.2 beta 5", date: "March 11, 2019", alignment: "left" },
                                { name: "tvOS 12.2 beta 6", date: "March 18, 2019", alignment: "right" },
                                { name: "tvOS 12.2 final build", date: "March 25, 2019", spanTwo: true }
                            ],
                            supplemental: [
                                { name: "tvOS 12.2.1", date: "April 8, 2019" },
                            ]
                        },
                        "12-3": {
                            label: "tvOS 12.3",
                            releases: [
                                { name: "tvOS 12.3 beta 1", date: "March 27, 2019", alignment: "left" },
                                { name: "tvOS 12.3 beta 2", date: "April 8, 2019", alignment: "right" },
                                { name: "tvOS 12.3 beta 3", date: "April 22, 2019", alignment: "left" },
                                { name: "tvOS 12.3 beta 4", date: "April 29, 2019", alignment: "right" },
                                { name: "tvOS 12.3 beta 5", date: "May 7, 2019", spanTwo: true },
                                { name: "tvOS 12.3 final build", date: "May 13, 2019", spanTwo: true },
                            ],
                        },
                        "12-4": {
                            label: "tvOS 12.4",
                            releases: [
                                { name: "tvOS 12.4 beta 1", date: "May 15, 2019", alignment: "left" },
                                { name: "tvOS 12.4 beta 2", date: "May 28, 2019", alignment: "right" },
                                { name: "tvOS 12.4 beta 3", date: "June 11, 2019", spanTwo: true },
                                { name: "tvOS 12.4 final build", date: "July 22, 2019", spanTwo: true },
                            ],
                            supplemental: [
                                { name: "tvOS 12.4.1", date: "August 26, 2019" },
                            ]
                        },
                    };
            initializeTimelinePage(timelines);
        },
        "tvos-13.html": () => {
            const timelines = {
                        "13-0": {
                            label: "tvOS 13.0",
                            releases: [
                                { name: "tvOS 13.0 beta 1", date: "June 3, 2019", alignment: "left" },
                                { name: "tvOS 13.0 beta 2", date: "June 17, 2019", alignment: "right" },
                                { name: "tvOS 13.0 beta 3", date: "July 2, 2019", alignment: "left" },
                                { name: "tvOS 13.0 beta 4", date: "July 17, 2019", alignment: "right" },
                                { name: "tvOS 13.0 beta 5", date: "July 29, 2019", alignment: "left" },
                                { name: "tvOS 13.0 beta 6", date: "August 7, 2019", alignment: "right" },
                                { name: "tvOS 13.0 beta 7", date: "August 15, 2019", alignment: "left" },
                                { name: "tvOS 13.0 beta 8", date: "August 27, 2019", alignment: "right" },
                                { name: "tvOS 13.0 beta 9", date: "September 4, 2019", alignment: "left" },
                                { name: "tvOS 13.0 beta 10", date: "September 10, 2019", alignment: "right" },
                                { name: "tvOS 13.0 beta 11", date: "September 18, 2019", spanTwo: true },
                                { name: "tvOS 13.0 final build", date: "September 24, 2019", spanTwo: true },
                            ],
                        },
                        "13-2": {
                            label: "tvOS 13.2",
                            releases: [
                                { name: "tvOS 13.2 beta 1", date: "October 2, 2019", alignment: "left" },
                                { name: "tvOS 13.2 beta 2", date: "October 10, 2019", alignment: "right" },
                                { name: "tvOS 13.2 beta 3", date: "October 16, 2019", alignment: "left" },
                                { name: "tvOS 13.2 beta 4", date: "October 23, 2019", alignment: "right" },
                                { name: "tvOS 13.2 final build", date: "October 28, 2019", spanTwo: true }
                            ],
                        },
                        "13-3": {
                            label: "tvOS 13.3",
                            releases: [
                                { name: "tvOS 13.3 beta 1", date: "November 5, 2019", alignment: "left" },
                                { name: "tvOS 13.3 beta 2", date: "November 12, 2019", alignment: "right" },
                                { name: "tvOS 13.3 beta 3", date: "November 20, 2019", alignment: "left" },
                                { name: "tvOS 13.3 beta 4", date: "December 5, 2019", alignment: "right" },
                                { name: "tvOS 13.3 final build", date: "December 10, 2019", spanTwo: true }
                            ],
                        },
                        "13-3-1": {
                            label: "tvOS 13.3.1",
                            releases: [
                                { name: "tvOS 13.3.1 beta 1", date: "December 17, 2019", alignment: "left" },
                                { name: "tvOS 13.3.1 beta 2", date: "January 14, 2020", alignment: "right" },
                                { name: "tvOS 13.3.1 beta 3", date: "January 22, 2020", spanTwo: true },
                                { name: "tvOS 13.3.1 final build", date: "January 28, 2020", spanTwo: true }
                            ],
                        },
                        "13-4": {
                            label: "tvOS 13.4",
                            releases: [
                                { name: "tvOS 13.4 beta 1", date: "February 5, 2020", alignment: "left" },
                                { name: "tvOS 13.4 beta 2", date: "February 19, 2020", alignment: "right" },
                                { name: "tvOS 13.4 beta 3", date: "February 26, 2020", alignment: "left" },
                                { name: "tvOS 13.4 beta 4", date: "March 3, 2020", alignment: "right" },
                                { name: "tvOS 13.4 beta 5", date: "March 10, 2020", alignment: "left" },
                                { name: "tvOS 13.4 beta 6", date: "March 18, 2020", alignment: "right" },
                                { name: "tvOS 13.4 final build", date: "March 24, 2020", spanTwo: true }
                            ],
                        },
                        "13-4-5": {
                            label: "tvOS 13.4.5",
                            releases: [
                                { name: "tvOS 13.4.5 beta 1", date: "March 31, 2020", alignment: "left" },
                                { name: "tvOS 13.4.5 beta 2", date: "April 15, 2020", alignment: "right" },
                                { name: "tvOS 13.4.5 beta 3", date: "April 29, 2020", alignment: "left" },
                                { name: "tvOS 13.4.5 beta 4", date: "May 6, 2020", alignment: "right" },
                                {
                                    pair: [
                                        { name: "tvOS 13.5 GM build", date: "May 18, 2020" },
                                        { name: "tvOS 13.5 final build", date: "May 20, 2020" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "tvOS 13.4.6", date: "June 1, 2020" }
                            ]
                        },
                        "13-4-8": {
                            label: "tvOS 13.4.8",
                            releases: [
                                { name: "tvOS 13.4.8 beta 1", date: "June 3, 2020", alignment: "left" },
                                { name: "tvOS 13.4.8 beta 2", date: "June 9, 2020", alignment: "right" },
                                { name: "tvOS 13.4.8 beta 3", date: "June 30, 2020", spanTwo: true },
                                {
                                    pair: [
                                        { name: "tvOS 13.4.8 GM build", date: "July 9, 2020" },
                                        { name: "tvOS 13.4.8 final build", date: "July 15, 2020" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                    };
            initializeTimelinePage(timelines);
        },
        "tvos-14.html": () => {
            const timelines = {
                        "14-0": {
                            label: "iOS 14.0",
                            releases: [
                                { name: "tvOS 14.0 beta 1", date: "June 22, 2020", alignment: "left" },
                                { name: "tvOS 14.0 beta 2", date: "July 7, 2020", alignment: "right" },
                                { name: "tvOS 14.0 beta 3", date: "July 22, 2020", alignment: "left" },
                                { name: "tvOS 14.0 beta 4", date: "August 4, 2020", alignment: "right" },
                                { name: "tvOS 14.0 beta 5", date: "August 18, 2020", alignment: "left" },
                                { name: "tvOS 14.0 beta 6", date: "August 25, 2020", alignment: "right" },
                                { name: "tvOS 14.0 beta 7", date: "September 3, 2020", alignment: "left" },
                                { name: "tvOS 14.0 beta 8", date: "September 9, 2020", alignment: "right" },
                                {
                                    pair: [
                                        { name: "tvOS 14.0 GM build", date: "September 15, 2020" },
                                        { name: "tvOS 14.0 final build", date: "September 16, 2020" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                {
                                    pair: [
                                        { name: "iOS 14.0.1", date: "September 24, 2020" },
                                        { name: "iOS 14.0.2", date: "October 5, 2020" },
                                    ],
                                    className: "release-pair-tight"
                                }
                            ]
                        },
                        "14-2": {
                            label: "iOS 14.2",
                            releases: [
                                { name: "tvOS 14.2 beta 1", date: "September 17, 2020", alignment: "left" },
                                { name: "tvOS 14.2 beta 2", date: "September 29, 2020", alignment: "right" },
                                { name: "tvOS 14.2 beta 3", date: "October 13, 2020", alignment: "left" },
                                { name: "tvOS 14.2 beta 4", date: "October 20, 2020", alignment: "right" },
                                {
                                    pair: [
                                        { name: "tvOS 14.2 RC build", date: "October 30, 2020" },
                                        { name: "tvOS 14.2 final build", date: "November 5, 2020" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "14-3": {
                            label: "tvOS 14.3",
                            releases: [
                                { name: "tvOS 14.3 beta 1", date: "November 12, 2020", alignment: "left" },
                                { name: "tvOS 14.3 beta 2", date: "November 17, 2020", alignment: "right" },
                                { name: "tvOS 14.3 beta 3", date: "December 2, 2020", spanTwo: true },
                                {
                                    pair: [
                                        { name: "tvOS 14.3 RC build", date: "December 8, 2020" },
                                        { name: "tvOS 14.3 final build", date: "December 14, 2020" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "14-4": {
                            label: "tvOS 14.4",
                            releases: [
                                { name: "tvOS 14.4 beta 1", date: "December 16, 2020", alignment: "left" },
                                { name: "tvOS 14.4 beta 2", date: "January 13, 2021", alignment: "right" },
                                {
                                    pair: [
                                        { name: "tvOS 14.4 RC build", date: "January 21, 2021" },
                                        { name: "tvOS 14.4 final build", date: "January 26, 2021" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "14-5": {
                            label: "tvOS 14.5",
                            releases: [
                                { name: "tvOS 14.5 beta 1", date: "February 1, 2021", alignment: "left" },
                                { name: "tvOS 14.5 beta 2", date: "February 16, 2021", alignment: "right" },
                                { name: "tvOS 14.5 beta 3", date: "March 2, 2021", alignment: "left" },
                                { name: "tvOS 14.5 beta 4", date: "March 15, 2021", alignment: "right" },
                                { name: "tvOS 14.5 beta 5", date: "March 23, 2021", alignment: "left" },
                                { name: "tvOS 14.5 beta 6", date: "March 31, 2021", alignment: "right" },
                                { name: "tvOS 14.5 beta 7", date: "April 7, 2021", alignment: "left" },
                                { name: "tvOS 14.5 beta 8", date: "April 13, 2021", alignment: "right" },
                                {
                                    pair: [
                                        { name: "tvOS 14.5 RC build", date: "April 20, 2021" },
                                        { name: "tvOS 14.5 final build", date: "April 26, 2021" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "14-6": {
                            label: "tvOS 14.6",
                            releases: [
                                { name: "tvOS 14.6 beta 1", date: "April 22, 2021", alignment: "left" },
                                { name: "tvOS 14.6 beta 2", date: "April 30, 2021", alignment: "right" },
                                { name: "tvOS 14.6 beta 3", date: "May 10, 2021", spanTwo: true },
                                {
                                    pair: [
                                        { name: "tvOS 14.6 RC build", date: "May 17, 2021" },
                                        { name: "tvOS 14.6 final build", date: "May 24, 2021" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "14-7": {
                            label: "tvOS 14.7",
                            releases: [
                                { name: "tvOS 14.7 beta 1", date: "May 19, 2021", alignment: "left" },
                                { name: "tvOS 14.7 beta 2", date: "June 2, 2021", alignment: "right" },
                                { name: "tvOS 14.7 beta 3", date: "June 14, 2021", alignment: "left" },
                                { name: "tvOS 14.7 beta 4", date: "June 29, 2021", alignment: "right" },
                                { name: "tvOS 14.7 beta 5", date: "July 8, 2021", spanTwo: true },
                                {
                                    pair: [
                                        { name: "iOS 14.7 RC build", date: "July 13, 2021" },
                                        { name: "iOS 14.7 final build", date: "July 19, 2021" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                    };
            initializeTimelinePage(timelines);
        },
        "tvos-15.html": () => {
            const timelines = {
                        "15-0": {
                            label: "tvOS 15.0",
                            releases: [
                                { name: "tvOS 15.0 beta 1", date: "June 7, 2021", alignment: "left" },
                                { name: "tvOS 15.0 beta 2", date: "June 24, 2021", alignment: "right" },
                                { name: "tvOS 15.0 beta 3", date: "July 14, 2021", alignment: "left" },
                                { name: "tvOS 15.0 beta 4", date: "July 27, 2021", alignment: "right" },
                                { name: "tvOS 15.0 beta 5", date: "August 10, 2021", alignment: "left" },
                                { name: "tvOS 15.0 beta 6", date: "August 17, 2021", alignment: "right" },
                                { name: "tvOS 15.0 beta 7", date: "August 25, 2021", alignment: "left" },
                                { name: "tvOS 15.0 beta 8", date: "August 31, 2021", alignment: "right" },
                                { name: "tvOS 15.0 beta 9", date: "September 7, 2021", spanTwo: true },
                                {
                                    pair: [
                                        { name: "iOS 15.0 RC build", date: "September 14, 2021" },
                                        { name: "iOS 15.0 final build", date: "September 20, 2021" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "15-1": {
                            label: "tvOS 15.1",
                            releases: [
                                { name: "tvOS 15.1 beta 1", date: "September 21, 2021", alignment: "left" },
                                { name: "tvOS 15.1 beta 2", date: "September 28, 2021", alignment: "right" },
                                { name: "tvOS 15.1 beta 3", date: "October 6, 2021", alignment: "left" },
                                { name: "tvOS 15.1 beta 4", date: "October 13, 2021", alignment: "right" },
                                {
                                    pair: [
                                        { name: "tvOS 15.1 RC build", date: "October 18, 2021" },
                                        { name: "tvOS 15.1 final build", date: "October 25, 2021" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "iOS 15.1.1", date: "November 1, 2021" }
                            ]
                        },
                        "15-2": {
                            label: "tvOS 15.2",
                            releases: [
                                { name: "tvOS 15.2 beta 1", date: "October 27, 2021", alignment: "left" },
                                { name: "tvOS 15.2 beta 2", date: "November 9, 2021", alignment: "right" },
                                { name: "tvOS 15.2 beta 3", date: "November 16, 2021", alignment: "left" },
                                { name: "tvOS 15.2 beta 4", date: "December 2, 2021", alignment: "right" },
                                {
                                    pair: [
                                        { name: "tvOS 15.2 RC build", date: "December 7, 2021" },
                                        { name: "tvOS 15.2 final build", date: "December 13, 2021" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "15-3": {
                            label: "tvOS 15.3",
                            releases: [
                                { name: "tvOS 15.3 beta 1", date: "December 17, 2021", alignment: "left" },
                                { name: "tvOS 15.3 beta 2", date: "January 12, 2022", alignment: "right" },
                                {
                                    pair: [
                                        { name: "tvOS 15.3 RC build", date: "January 20, 2022" },
                                        { name: "tvOS 15.3 final build", date: "January 26, 2022" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "15-4": {
                            label: "tvOS 15.4",
                            releases: [
                                { name: "tvOS 15.4 beta 1", date: "January 27, 2022", alignment: "left" },
                                { name: "tvOS 15.4 beta 2", date: "February 8, 2022", alignment: "right" },
                                { name: "tvOS 15.4 beta 3", date: "February 15, 2022", alignment: "left" },
                                { name: "tvOS 15.4 beta 4", date: "February 22, 2022", alignment: "right" },
                                { name: "tvOS 15.4 beta 5", date: "March 1, 2022", spanTwo: true },
                                {
                                    pair: [
                                        { name: "tvOS 15.4 RC build", date: "March 8, 2022" },
                                        { name: "tvOS 15.4 final build", date: "March 14, 2022" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "tvOS 15.4.1", date: "March 31, 2022" }
                            ]
                        },
                        "15-5": {
                            label: "tvOS 15.5",
                            releases: [
                                { name: "tvOS 15.5 beta 1", date: "April 5, 2022", alignment: "left" },
                                { name: "tvOS 15.5 beta 2", date: "April 19, 2022", alignment: "right" },
                                { name: "tvOS 15.5 beta 3", date: "April 26, 2022", alignment: "left" },
                                { name: "tvOS 15.5 beta 4", date: "May 3, 2022", alignment: "right" },
                                {
                                    pair: [
                                        { name: "tvOS 15.5 RC build", date: "May 12, 2022" },
                                        { name: "tvOS 15.5 final build", date: "May 16, 2022" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "tvOS 15.5.1", date: "May 25, 2022" },
                            ]
                        },
                        "15-6": {
                            label: "tvOS 15.6",
                            releases: [
                                { name: "tvOS 15.6 beta 1", date: "May 18, 2022", alignment: "left" },
                                { name: "tvOS 15.6 beta 2", date: "May 31, 2022", alignment: "right" },
                                { name: "tvOS 15.6 beta 3", date: "June 14, 2022", alignment: "left" },
                                { name: "tvOS 15.6 beta 4", date: "June 28, 2022", alignment: "right" },
                                { name: "tvOS 15.6 beta 5", date: "July 5, 2022", spanTwo: true },
                                {
                                    pair: [
                                        { name: "tvOS 15.6 RC build", date: "July 12, 2022" },
                                        { name: "tvOS 15.6 final build", date: "July 20, 2022" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                    };
            initializeTimelinePage(timelines);
        },
        "tvos-16.html": () => {
            const timelines = {
                        "16-0": {
                            label: "tvOS 16.0",
                            releases: [
                                { name: "tvOS 16.0 beta 1", date: "June 6, 2022", alignment: "left" },
                                { name: "tvOS 16.0 beta 2", date: "June 22, 2022", alignment: "right" },
                                { name: "tvOS 16.0 beta 3", date: "July 6, 2022", alignment: "left" },
                                { name: "tvOS 16.0 beta 4", date: "July 27, 2022", alignment: "right" },
                                { name: "tvOS 16.0 beta 5", date: "August 8, 2022", alignment: "left" },
                                { name: "tvOS 16.0 beta 6", date: "August 15, 2022", alignment: "right" },
                                { name: "tvOS 16.0 beta 7", date: "August 23, 2022", spanTwo: true },
                                {
                                    pair: [
                                        { name: "tvOS 16.0 RC build", date: "September 7, 2022" },
                                        { name: "tvOS 16.0 final build", date: "September 12, 2022" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "16-1": {
                            label: "tvOS 16.1",
                            releases: [
                                { name: "tvOS 16.1 beta 1", date: "September 14, 2022", alignment: "left" },
                                { name: "tvOS 16.1 beta 2", date: "September 20, 2022", alignment: "right" },
                                { name: "tvOS 16.1 beta 3", date: "September 27, 2022", alignment: "left" },
                                { name: "tvOS 16.1 beta 4", date: "October 4, 2022", alignment: "right" },
                                { name: "tvOS 16.1 beta 5", date: "October 11, 2022", spanTwo: true },
                                {
                                    pair: [
                                        { name: "tvOS 16.1 RC build", date: "October 18, 2022" },
                                        { name: "tvOS 16.1 final build", date: "October 24, 2022" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "tvOS 16.1.1", date: "November 16, 2022" },
                            ]
                        },
                        "16-2": {
                            label: "tvOS 16.2",
                            releases: [
                                { name: "tvOS 16.2 beta 1", date: "October 25, 2022", alignment: "left" },
                                { name: "tvOS 16.2 beta 2", date: "November 8, 2022", alignment: "right" },
                                { name: "tvOS 16.2 beta 3", date: "November 15, 2022", alignment: "left" },
                                { name: "tvOS 16.2 beta 4", date: "December 1, 2022", alignment: "right" },
                                {
                                    pair: [
                                        { name: "tvOS 16.2 RC build", date: "December 7, 2022" },
                                        { name: "tvOS 16.2 final build", date: "December 13, 2022" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "16-3": {
                            label: "tvOS 16.3",
                            releases: [
                                { name: "tvOS 16.3 beta 1", date: "December 14, 2022", alignment: "left" },
                                { name: "tvOS 16.3 beta 2", date: "January 10, 2023", alignment: "right" },
                                {
                                    pair: [
                                        { name: "tvOS 16.3 RC build", date: "January 18, 2023" },
                                        { name: "tvOS 16.3 final build", date: "January 23, 2023" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                {
                                    trio: [
                                        { name: "tvOS 16.3.1", date: "February 6, 2023" },
                                        { name: "tvOS 16.3.2", date: "February 13, 2023" },
                                        { name: "tvOS 16.3.3", date: "March 6, 2023" },
                                    ],
                                    className: "release-trio-tight"
                                }
                            ]
                        },
                        "16-4": {
                            label: "tvOS 16.4",
                            releases: [
                                { name: "tvOS 16.4 beta 1", date: "February 16, 2023", alignment: "left" },
                                { name: "tvOS 16.4 beta 2", date: "February 28, 2023", alignment: "right" },
                                { name: "tvOS 16.4 beta 3", date: "March 7, 2023", alignment: "left" },
                                { name: "tvOS 16.4 beta 4", date: "March 15, 2023", alignment: "right" },
                                {
                                    pair: [
                                        { name: "tvOS 16.4 RC build", date: "March 21, 2023" },
                                        { name: "tvOS 16.4 final build", date: "March 27, 2023" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "tvOS 16.4.1", date: "April 12, 2023" }
                            ]
                        },
                        "16-5": {
                            label: "tvOS 16.5",
                            releases: [
                                { name: "tvOS 16.5 beta 1", date: "March 28, 2023", alignment: "left" },
                                { name: "tvOS 16.5 beta 2", date: "April 11, 2023", alignment: "right" },
                                { name: "tvOS 16.5 beta 3", date: "April 25, 2023", alignment: "left" },
                                { name: "tvOS 16.5 beta 4", date: "May 2, 2023", alignment: "right" },
                                {
                                    pair: [
                                        { name: "tvOS 16.5 RC build", date: "May 9, 2023" },
                                        { name: "tvOS 16.5 final build", date: "May 18, 2023" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "16-6": {
                            label: "tvOS 16.6",
                            releases: [
                                { name: "tvOS 16.6 beta 1", date: "May 19, 2023", alignment: "left" },
                                { name: "tvOS 16.6 beta 2", date: "May 31, 2023", alignment: "right" },
                                { name: "tvOS 16.6 beta 3", date: "June 15, 2023", alignment: "left" },
                                { name: "tvOS 16.6 beta 4", date: "June 27, 2023", alignment: "right" },
                                { name: "tvOS 16.6 beta 5", date: "July 10, 2023", spanTwo: true },
                                {
                                    pair: [
                                        { name: "tvOS 16.6 RC build", date: "July 18, 2023" },
                                        { name: "tvOS 16.6 final build", date: "July 24, 2023" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                    };
            initializeTimelinePage(timelines);
        },
        "tvos-17.html": () => {
            const timelines = {
                        "17-0": {
                            label: "tvOS 17.0",
                            releases: [
                                { name: "tvOS 17.0 beta 1", date: "June 5, 2023", alignment: "left" },
                                { name: "tvOS 17.0 beta 2", date: "June 21, 2023", alignment: "right" },
                                { name: "tvOS 17.0 beta 3", date: "July 5, 2023", note: "build 2: July 11, 2023", alignment: "left" },
                                { name: "tvOS 17.0 beta 4", date: "July 25, 2023", alignment: "right" },
                                { name: "tvOS 17.0 beta 5", date: "August 8, 2023", alignment: "left" },
                                { name: "tvOS 17.0 beta 6", date: "August 15, 2023", alignment: "right" },
                                { name: "tvOS 17.0 beta 7", date: "August 22, 2023", alignment: "left" },
                                { name: "tvOS 17.0 beta 8", date: "August 29, 2023", alignment: "right" },
                                { name: "tvOS 17.0 beta 9", date: "September 5, 2023", spanTwo: true },
                                {
                                    pair: [
                                        { name: "tvOS 17.0 RC build", date: "September 12, 2023" },
                                        { name: "tvOS 17.0 final build", date: "September 18, 2023" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "17-1": {
                            label: "tvOS 17.1",
                            releases: [
                                { name: "tvOS 17.1 beta 1", date: "September 27, 2023", alignment: "left" },
                                { name: "tvOS 17.1 beta 2", date: "October 3, 2023", alignment: "right" },
                                { name: "tvOS 17.1 beta 3", date: "October 10, 2023", spanTwo: true },
                                {
                                    pair: [
                                        { name: "tvOS 17.1 RC build", date: "October 17, 2023" },
                                        { name: "tvOS 17.1 final build", date: "October 25, 2023" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "17-2": {
                            label: "tvOS 17.2",
                            releases: [
                                { name: "tvOS 17.2 beta 1", date: "October 26, 2023", alignment: "left" },
                                { name: "tvOS 17.2 beta 2", date: "November 9, 2023", alignment: "right" },
                                { name: "tvOS 17.2 beta 3", date: "November 14, 2023", alignment: "left" },
                                { name: "tvOS 17.2 beta 4", date: "November 28, 2023", alignment: "right" },
                                {
                                    pair: [
                                        { name: "tvOS 17.2 RC build", date: "December 5, 2023", note: "build 2: December 8, 2023" },
                                        { name: "tvOS 17.2 final build", date: "December 11, 2023" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "17-3": {
                            label: "tvOS 17.3",
                            releases: [
                                { name: "tvOS 17.3 beta 1", date: "December 12, 2023", alignment: "left" },
                                { name: "tvOS 17.3 beta 2", date: "January 3, 2024", alignment: "right" },
                                { name: "tvOS 17.3 beta 3", date: "January 9, 2024", spanTwo: true },
                                {
                                    pair: [
                                        { name: "tvOS 17.3 RC build", date: "January 17, 2024" },
                                        { name: "tvOS 17.3 final build", date: "January 22, 2024" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "17-4": {
                            label: "tvOS 17.4",
                            releases: [
                                { name: "tvOS 17.4 beta 1", date: "January 25, 2024", alignment: "left" },
                                { name: "tvOS 17.4 beta 2", date: "February 6, 2024", alignment: "right" },
                                { name: "tvOS 17.4 beta 3", date: "February 13, 2024", alignment: "left" },
                                { name: "tvOS 17.4 beta 4", date: "February 20, 2024", alignment: "right" },
                                { name: "tvOS 17.4 beta 5", date: "February 27, 2024", spanTwo: true },
                                {
                                    pair: [
                                        { name: "tvOS 17.4 RC build", date: "March 4, 2024" },
                                        { name: "tvOS 17.4 final build", date: "March 7, 2024" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "17-5": {
                            label: "tvOS 17.5",
                            releases: [
                                { name: "tvOS 17.5 beta 1", date: "April 2, 2024", alignment: "left" },
                                { name: "tvOS 17.5 beta 2", date: "April 16, 2024", alignment: "right" },
                                { name: "tvOS 17.5 beta 3", date: "April 23, 2024", alignment: "left" },
                                { name: "tvOS 17.5 beta 4", date: "April 30, 2024", alignment: "right" },
                                {
                                    pair: [
                                        { name: "tvOS 17.5 RC build", date: "May 7, 2024" },
                                        { name: "tvOS 17.5 final build", date: "May 13, 2024" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "tvOS 17.5.1", date: "May 21, 2024" }
                            ]
                        },
                        "17-6": {
                            label: "tvOS 17.6",
                            releases: [
                                { name: "tvOS 17.6 beta 1", date: "June 17, 2024", alignment: "left" },
                                { name: "tvOS 17.6 beta 2", date: "July 1, 2024", alignment: "right" },
                                { name: "tvOS 17.6 beta 3", date: "July 9, 2024", alignment: "left" },
                                { name: "tvOS 17.6 beta 4", date: "July 16, 2024", alignment: "right"},
                                {
                                    pair: [
                                        { name: "tvOS 17.6 RC build", date: "July 23, 2024" },
                                        { name: "tvOS 17.6 final build", date: "July 29, 2024" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "tvOS 17.6.1", date: "August 19, 2024" },
                            ]
                        },
                    };
            initializeTimelinePage(timelines);
        },
        "tvos-18.html": () => {
            const timelines = {
                        "18-0": {
                            label: "tvOS 18.0",
                            releases: [
                                { name: "tvOS 18.0 beta 1", date: "June 10, 2024", alignment: "left" },
                                { name: "tvOS 18.0 beta 2", date: "June 24, 2024", alignment: "right" },
                                { name: "tvOS 18.0 beta 3", date: "July 8, 2024", alignment: "left" },
                                { name: "tvOS 18.0 beta 4", date: "July 23, 2024", alignment: "right" },
                                { name: "tvOS 18.0 beta 5", date: "August 5, 2024", alignment: "left" },
                                { name: "tvOS 18.0 beta 6", date: "August 12, 2024", alignment: "right" },
                                { name: "tvOS 18.0 beta 7", date: "August 20, 2024", alignment: "left" },
                                { name: "tvOS 18.0 beta 8", date: "August 28, 2024", alignment: "right" },
                                {
                                    pair: [
                                        { name: "tvOS 18.0 RC build", date: "September 9, 2024" },
                                        { name: "tvOS 18.0 final build", date: "September 16, 2024" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "18-1": {
                            label: "tvOS 18.1",
                            releases: [
                                { name: "tvOS 18.1 beta 1", date: "September 17, 2024", alignment: "left" },
                                { name: "tvOS 18.1 beta 2", date: "September 23, 2024", alignment: "right" },
                                { name: "tvOS 18.1 beta 3", date: "October 1, 2024", alignment: "left" },
                                { name: "tvOS 18.1 beta 4", date: "October 7, 2024", alignment: "right" },
                                { name: "tvOS 18.1 beta 5", date: "October 14, 2024", spanTwo: true },
                                {
                                    pair: [
                                        { name: "tvOS 18.1 RC build", date: "October 21, 2024", note: "build 2: October 23, 2024" },
                                        { name: "tvOS 18.1 final build", date: "October 28, 2024" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "18-2": {
                            label: "tvOS 18.2",
                            releases: [
                                { name: "tvOS 18.2 beta 1", date: "October 23, 2024", alignment: "left" },
                                { name: "tvOS 18.2 beta 2", date: "November 4, 2024", alignment: "right" },
                                { name: "tvOS 18.2 beta 3", date: "November 11, 2024", alignment: "left" },
                                { name: "tvOS 18.2 beta 4", date: "November 20, 2024", alignment: "right" },
                                {
                                    pair: [
                                        { name: "tvOS 18.2 RC build", date: "December 5, 2024", note: "build 2: December 9, 2024" },
                                        { name: "tvOS 18.2 final build", date: "December 11, 2024" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "tvOS 18.2.1", date: "January 16, 2025" }
                            ]
                        },
                        "18-3": {
                            label: "tvOS 18.3",
                            releases: [
                                { name: "tvOS 18.3 beta 1", date: "December 16, 2024", alignment: "left" },
                                { name: "tvOS 18.3 beta 2", date: "January 7, 2025", alignment: "right" },
                                { name: "tvOS 18.3 beta 3", date: "January 16, 2025", spanTwo: true },
                                {
                                    pair: [
                                        { name: "tvOS 18.3 RC build", date: "January 21, 2025" },
                                        { name: "tvOS 18.3 final build", date: "January 27, 2025" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "tvOS 18.3.1", date: "March 11, 2025" },
                            ]
                        },
                        "18-4": {
                            label: "tvOS 18.4",
                            releases: [
                                { name: "tvOS 18.4 beta 1", date: "February 21, 2025", alignment: "left" },
                                { name: "tvOS 18.4 beta 2", date: "March 3, 2025", alignment: "right" },
                                { name: "tvOS 18.4 beta 3", date: "March 10, 2025", alignment: "left" },
                                { name: "tvOS 18.4 beta 4", date: "March 17, 2025", alignment: "right" },
                                {
                                    pair: [
                                        { name: "tvOS 18.4 RC build", date: "March 24, 2025" },
                                        { name: "tvOS 18.4 final build", date: "March 31, 2025" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "tvOS 18.4.1", date: "April 16, 2025" }
                            ]
                        },
                        "18-5": {
                            label: "tvOS 18.5",
                            releases: [
                                { name: "tvOS 18.5 beta 1", date: "April 2, 2025", alignment: "left" },
                                { name: "tvOS 18.5 beta 2", date: "April 14, 2025", alignment: "right" },
                                { name: "tvOS 18.5 beta 3", date: "April 21, 2025", alignment: "left" },
                                { name: "tvOS 18.5 beta 4", date: "April 28, 2025", alignment: "right" },
                                {
                                    pair: [
                                        { name: "tvOS 18.5 RC build", date: "May 6, 2025" },
                                        { name: "tvOS 18.5 final build", date: "May 12, 2025" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ]
                        },
                        "18-6": {
                            label: "tvOS 18.6",
                            releases: [
                                { name: "tvOS 18.6 beta 1", date: "June 16, 2025", alignment: "left" },
                                { name: "tvOS 18.6 beta 2", date: "June 30, 2025", alignment: "right" },
                                { name: "tvOS 18.6 beta 3", date: "July 14, 2025", spanTwo: true },
                                {
                                    pair: [
                                        { name: "tvOS 18.6 RC build", date: "July 21, 2025" },
                                        { name: "tvOS 18.6 final build", date: "July 29, 2025" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                    };
            initializeTimelinePage(timelines);
        },
        "tvos-26.html": () => {
            const timelines = {
                        "26-0": {
                            label: "tvOS 26.0",
                            releases: [
                                { name: "tvOS 26.0 beta 1", date: "Jun 9, 2025" },
                                { name: "tvOS 26.0 beta 2", date: "Jun 23, 2025" },
                                { name: "tvOS 26.0 beta 3", date: "Jul 7, 2025" },
                                { name: "tvOS 26.0 beta 4", date: "Jul 22, 2025" },
                                { name: "tvOS 26.0 beta 5", date: "Aug 5, 2025" },
                                { name: "tvOS 26.0 beta 6", date: "Aug 11, 2025" },
                                { name: "tvOS 26.0 beta 7", date: "Aug 18, 2025" },
                                { name: "tvOS 26.0 beta 8", date: "Aug 25, 2025" },
                                { name: "tvOS 26.0 beta 9", date: "Sep 2, 2025", spanTwo: true },
                                {
                                    pair: [
                                        { name: "tvOS 26.0 RC build", date: "Sep 9, 2025" },
                                        { name: "tvOS 26.0 final build", date: "Sep 15, 2025" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "tvOS 26.0.1", date: "Sep 29, 2025" }
                            ]
                        },
                        "26-1": {
                            label: "tvOS 26.1",
                            releases: [
                                { name: "tvOS 26.1 beta 1", date: "Sep 22, 2025" },
                                { name: "tvOS 26.1 beta 2", date: "Oct 6, 2025" },
                                { name: "tvOS 26.1 beta 3", date: "Oct 13, 2025" },
                                { name: "tvOS 26.1 beta 4", date: "Oct 20, 2025" },
                                {
                                    pair: [
                                        { name: "tvOS 26.1 RC build", date: "Oct 28, 2025" },
                                        { name: "tvOS 26.1 final build", date: "Nov 3, 2025" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ]
                        },
                        "26-2": {
                            label: "tvOS 26.2",
                            releases: [
                                { name: "tvOS 26.2 beta 1", date: "Nov 4, 2025" },
                                { name: "tvOS 26.2 beta 2", date: "Nov 12, 2025" },
                                { name: "tvOS 26.2 beta 3", date: "Nov 17, 2025", spanTwo: true },
                                {
                                    pair: [
                                        { name: "tvOS 26.2 RC build", date: "Dec 3, 2025", note: "build 2: Dec 4, 2025" },
                                        { name: "tvOS 26.2 final build", date: "Dec 12, 2025" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "26-3": {
                            label: "tvOS 26.3",
                            releases: [
                                { name: "tvOS 26.3 beta 1", date: "Dec 15, 2025" },
                                { name: "tvOS 26.3 beta 2", date: "Jan 12, 2026" },
                                { name: "tvOS 26.3 beta 3", date: "Jan 26, 2026", spanTwo: true },
                                {
                                    pair: [
                                        { name: "tvOS 26.3 RC build", date: "Feb 4, 2026" },
                                        { name: "tvOS 26.3 final build", date: "Feb 11, 2026" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "26-4": {
                            label: "tvOS 26.4",
                            releases: [
                                { name: "tvOS 26.4 beta 1", date: "Feb 16, 2026" },
                                { name: "tvOS 26.4 beta 2", date: "Feb 23, 2026" },
                                { name: "tvOS 26.4 beta 3", date: "Mar 2, 2026", note: "build 2: Mar 5, 2026" },
                                { name: "tvOS 26.4 beta 4", date: "Mar 9, 2026" },
                                {
                                    pair: [
                                        { name: "tvOS 26.4 RC build", date: "Mar 18, 2026" },
                                        { name: "tvOS 26.4 final build", date: "Mar 24, 2026" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "26-5": {
                            label: "tvOS 26.5",
                            releases: [
                                { name: "tvOS 26.5 beta 1", date: "Mar 30, 2026" },
                                { name: "tvOS 26.5 beta 2", date: "Apr 13, 2026" },
                                { name: "tvOS 26.5 beta 3", date: "Apr 20, 2026" },
                                { name: "tvOS 26.5 beta 4", date: "Apr 27, 2026" },
                                {
                                    pair: [
                                        { name: "tvOS 26.5 RC build", date: "May 4, 2026" },
                                        { name: "tvOS 26.5 final build", date: "May 11, 2026" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "26-6": {
                            label: "tvOS 26.6",
                            releases: [
                                { name: "tvOS 26.6 beta 1", date: "May 26, 2026" },
                                { name: "tvOS 26.6 beta 2", date: "Jun 15, 2026" },
                                { name: "tvOS 26.6 beta 3", date: "Jun 29, 2026" },
                                { name: "tvOS 26.6 beta 4", date: "Jul 6, 2026" },
                                { name: "tvOS 26.6 beta 5", date: "Jul 13, 2026", spanTwo: true },
                                {
                                    pair: [
                                        { name: "tvOS 26.6 RC build", date: "Jul 20, 2026" },
                                        { name: "tvOS 26.6 final build", date: "Jul 27, 2026" }
            
                                    ],
                                    className: "release-pair-builds"
                                },
                            ],
                            supplemental: [
                                { name: "tvOS 26.6.1", date: "Oct 26, 2026" },
                            ]
                        },
                    };
            initializeTimelinePage(timelines);
        },
        "tvos-27.html": () => {
            const timelines = {
                        "27-0": {
                            label: "tvOS 27.0",
                            releases: [
                                { name: "tvOS 27.0 beta 1", date: "Jun 8, 2026" },
                                { name: "tvOS 27.0 beta 2", date: "Jun 22, 2026" },
                                { name: "tvOS 27.0 beta 3", date: "Jul 6, 2026" },
                                { name: "tvOS 27.0 beta 4", date: "Jul 20, 2026" },
                                { name: "tvOS 27.0 beta 5", date: "Aug 10, 2026" },
                                { name: "tvOS 27.0 beta 6", date: "Aug 17, 2026" },
                                { name: "tvOS 27.0 beta 7", date: "Aug 24, 2026" },
                                { name: "tvOS 27.0 beta 8", date: "Aug 31, 2026" },
                                {
                                    pair: [
                                        { name: "tvOS 27.0 RC build", date: "Sep 9, 2026" },
                                        { name: "tvOS 27.0 final build", date: "Sep 14, 2026" },
                                    ],
                                    className: "release-pair-builds"
                                },
                            ],
                        },
                        "27-2": {
                            label: "tvOS 27.2",
                            releases: [
                                { name: "tvOS 27.2 beta 1", date: "Sep 16, 2026" },
                                { name: "tvOS 27.2 beta 2", date: "Sep 21, 2026" },
                                { name: "tvOS 27.2 beta 3", date: "Oct 5, 2026", spanTwo: true },
                                {
                                    pair: [
                                        { name: "tvOS 27.2 RC build", date: "Oct 19, 2026" },
                                        { name: "tvOS 27.2 final build", date: "Oct 26, 2026" },
                                    ],
                                    className: "release-pair-builds"
                                }
                            ]
                        },
                        "27-3": {
                            label: "tvOS 27.3",
                            releases: [
                                { name: "tvOS 27.3 beta 1", date: "Nov 3, 2026" },
                            ]
                        }
                    };
            initializeTimelinePage(timelines);
        },
        "tvos-9.html": () => {
            const timelines = {
                        "9-0": {
                            label: "iOS 9-0",
                            releases: [
                                { name: "tvOS 9.0 beta 1", date: "September 9, 2015", alignment: "left" },
                                { name: "tvOS 9.0 beta 2", date: "September 23, 2015", alignment: "right" },
                                { name: "tvOS 9.0 beta 3", date: "October 6, 2015", spanTwo: true },
                                {
                                    pair: [
                                        { name: "tvOS 9.0 GM build", date: "October 21, 2015" },
                                        { name: "tvOS 9.0 final build", date: "October 30, 2015" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "tvOS 9.0.1", date: "November 9, 2015" },
                            ]
                        },
                        "9-1-x": {
                            label: "tvOS 9.1.x",
                            releases: [
                                { name: "tvOS 9.1 beta 1", date: "November 3, 2015", alignment: "left" },
                                { name: "tvOS 9.1 beta 2", date: "November 10, 2015", alignment: "right" },
                                { name: "tvOS 9.1 beta 3", date: "November 18, 2015", spanTwo: true },
                                { name: "tvOS 9.1 final build", date: "December 8, 2015", spanTwo: true }
                            ],
                            supplemental: [
                                { date: "tvOS 9.1.1", note: "beta 1: Jan 11, 2016\nFinal build: Jan 25, 2016" },
                            ]
                        },
                        "9-2-x": {
                            label: "tvOS 9.2",
                            releases: [
                                { name: "tvOSOS 9.2 beta 1", date: "January 11, 2016", alignment: "left" },
                                { name: "tvOS 9.2 beta 2", date: "January 25, 2016", alignment: "right" },
                                { name: "tvOS 9.2 beta 3", date: "February 8, 2016", alignment: "left" },
                                { name: "tvOS 9.2 beta 4", date: "February 22, 2016", alignment: "right" },
                                { name: "tvOS 9.2 beta 5", date: "March 1, 2016", alignment: "left" },
                                { name: "tvOS 9.2 beta 6", date: "March 10, 2016", alignment: "right" },
                                { name: "tvOS 9.2 final build", date: "March 21, 2016", spanTwo: true },
                            ],
                            supplemental: [
                                {
                                    pair: [
                                        { date: "tvOS 9.2.1", note: "beta 1: Apr 6, 2016\nbeta 2: Apr 20, 2016\nbeta 2, build 2: Apr 21, 2016\nbeta 3: Apr 27, 2016\nbeta 4: May 3, 2016\nFinal build: May 16, 2016" },
                                        { date: "tvOS 9.2.2", note: "beta 1: May 23, 2016\nbeta 2: Jun 6, 2016\nbeta 3: Jun 21, 2016\nbeta 4: Jun 29, 2016\nbeta 5: Jul 6, 2016\nFinal build: Jul 18, 2016" },
                                    ],
                                    className: "release-pair-tight"
                                }
                            ]
                        },
                    };
            initializeTimelinePage(timelines);
        },
        "visionos-1.html": () => {
            const timelines = {
                        "1-0": {
                            label: "visionOS 1.0",
                            releases: [
                                { name: "visionOS 1.0 beta 1", date: "June 21, 2023", alignment: "left" },
                                { name: "visionOS 1.0 beta 2", date: "July 25, 2023", alignment: "right" },
                                { name: "visionOS 1.0 beta 3", date: "August 29, 2023", alignment: "left" },
                                { name: "visionOS 1.0 beta 4", date: "October 3, 2023", alignment: "right" },
                                { name: "visionOS 1.0 beta 5", date: "October 31, 2023", alignment: "left" },
                                { name: "visionOS 1.0 beta 6", date: "November 14, 2023", alignment: "right" },
                                { name: "visionOS 1.0 beta 7", date: "December 12, 2023", spanTwo: true },
                                { name: "visionOS 1.0 final build", date: "February 2, 2024", spanTwo: true },
                            ],
                            supplemental: [
                                { name: "visionOS 1.0.1", date: "February 12, 2024" }, 
                            ]
                        },
                        "1-1": {
                            label: "visionOS 1.1",
                            releases: [
                                { name: "visionOS 1.1 beta 1", date: "February 6, 2024", alignment: "left" },
                                { name: "visionOS 1.1 beta 2", date: "February 13, 2024", alignment: "right" },
                                { name: "visionOS 1.1 beta 3", date: "February 20, 2024", alignment: "left" },
                                { name: "visionOS 1.1 beta 4", date: "February 27, 2024", alignment: "right" },
                                {
                                    pair: [
                                        { name: "visionOS 1.1 RC build", date: "March 4, 2024" },
                                        { name: "visionOS 1.1 final build", date: "March 7, 2024" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                {
                                    pair: [
                                        { name: "visionOS 1.1.1", date: "March 21, 2024" },
                                        { name: "visionOS 1.1.2", date: "April 9, 2024" },
                                    ],
                                    className: "release-pair-tight"
                                }
                            ]
                        },
                        "1-2": {
                            label: "visionOS 1.2",
                            releases: [
                                { name: "visionOS 1.2 beta 1", date: "April 2, 2024", note: "build 2: April 9, 2024", alignment: "left" },
                                { name: "visionOS 1.2 beta 2", date: "April 16, 2024", alignment: "right" },
                                { name: "visionOS 1.2 beta 3", date: "April 23, 2024", alignment: "left" },
                                { name: "visionOS 1.2 beta 4", date: "April 30, 2024", alignment: "right" },
                                { name: "visionOS 1.2 beta 5", date: "May 7, 2024", spanTwo: true },
                                { name: "visionOS 1.2 final build", date: "June 10, 2024", spanTwo: true },
                            ],
                        },
                        "1-3": {
                            label: "visionOS 1.3",
                            releases: [
                                { name: "visionOS 1.3 beta 1", date: "June 17, 2024", alignment: "left" },
                                { name: "visionOS 1.3 beta 2", date: "July 1, 2024", alignment: "right" },
                                { name: "visionOS 1.3 beta 3", date: "July 9, 2024", alignment: "left" },
                                { name: "visionOS 1.3 beta 4", date: "July 16, 2024", alignment: "right"},
                                {
                                    pair: [
                                        { name: "visionOS 1.3 RC build", date: "July 23, 2024" },
                                        { name: "visionOS 1.3 final build", date: "July 29, 2024" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                    };
            initializeTimelinePage(timelines);
        },
        "visionos-2.html": () => {
            const timelines = {
                        "2-0": {
                            label: "visionOS 2.0",
                            releases: [
                                { name: "visionOS 2.0 beta 1", date: "June 10, 2024", alignment: "left" },
                                { name: "visionOS 2.0 beta 2", date: "June 24, 2024", alignment: "right" },
                                { name: "visionOS 2.0 beta 3", date: "July 8, 2024", alignment: "left" },
                                { name: "visionOS 2.0 beta 4", date: "July 23, 2024", alignment: "right" },
                                { name: "visionOS 2.0 beta 5", date: "August 5, 2024", alignment: "left" },
                                { name: "visionOS 2.0 beta 6", date: "August 12, 2024", alignment: "right" },
                                { name: "visionOS 2.0 beta 7", date: "August 20, 2024", alignment: "left" },
                                { name: "visionOS 2.0 beta 8", date: "August 28, 2024", alignment: "right" },
                                { name: "visionOS 2.0 beta 9", date: "September 3, 2024", spanTwo: true },
                                {
                                    pair: [
                                        { name: "visionOS 2.0 RC build", date: "September 9, 2024" },
                                        { name: "visionOS 2.0 final build", date: "September 16, 2024" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "visionOS 2.0.1", date: "October 3, 2024" }
                            ]
                        },
                        "2-1": {
                            label: "visionOS 2.1",
                            releases: [
                                { name: "visionOS 2.1 beta 1", date: "September 17, 2024", alignment: "left" },
                                { name: "visionOS 2.1 beta 2", date: "September 23, 2024", alignment: "right" },
                                { name: "visionOS 2.1 beta 3", date: "October 1, 2024", alignment: "left" },
                                { name: "visionOS 2.1 beta 4", date: "October 7, 2024", alignment: "right" },
                                { name: "visionOS 2.1 beta 5", date: "October 14, 2024", alignment: "left" },
                                { name: "visionOS 2.1 beta 6", date: "October 18, 2024", alignment: "right" },
                                {
                                    pair: [
                                        { name: "visionOS 2.1 RC build", date: "October 21, 2024", note: "build 2: October 24, 2024" },
                                        { name: "visionOS 2.1 final build", date: "October 28, 2024" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "visionOS 2.1.1", date: "November 19, 2024" }
                            ]
                        },
                        "2-2": {
                            label: "visionOS 2.2",
                            releases: [
                                { name: "visionOS 2.2 beta 1", date: "November 4, 2024", alignment: "left" },
                                { name: "visionOS 2.2 beta 2", date: "November 12, 2024", alignment: "right" },
                                { name: "visionOS 2.2 beta 3", date: "November 18, 2024", alignment: "left" },
                                { name: "visionOS 2.2 beta 4", date: "December 3, 2024", alignment: "right" },
                                {
                                    pair: [
                                        { name: "visionOS 2.2 RC build", date: "December 5, 2024", note: "build 2: December 9, 2024" },
                                        { name: "visionOS 2.2 final build", date: "December 11, 2024" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "2-3": {
                            label: "visionOS 2.3",
                            releases: [
                                { name: "visionOS 2.3 beta 1", date: "December 16, 2024", alignment: "left" },
                                { name: "visionOS 2.3 beta 2", date: "January 7, 2025", alignment: "right" },
                                { name: "visionOS 2.3 beta 3", date: "January 16, 2025", spanTwo: true },
                                {
                                    pair: [
                                        { name: "visionOS 2.3 RC build", date: "January 21, 2025" },
                                        { name: "visionOS 2.3 final build", date: "January 27, 2025" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                {
                                    pair: [
                                        { name: "visionOS 2.3.1", date: "February 10, 2025" },
                                        { name: "visionOS 2.3.2", date: "March 11, 2025" },
                                    ],
                                    className: "release-pair-tight"
                                }
                            ]
                        },
                        "2-4": {
                            label: "visionOS 2.4",
                            releases: [
                                { name: "visionOS 2.4 beta 1", date: "February 21, 2025", alignment: "left" },
                                { name: "visionOS 2.4 beta 2", date: "March 3, 2025", alignment: "right" },
                                { name: "visionOS 2.4 beta 3", date: "March 10, 2025", alignment: "left" },
                                { name: "visionOS 2.4 beta 4", date: "March 17, 2025", alignment: "right" },
                                {
                                    pair: [
                                        { name: "visionOS 2.4 RC build", date: "March 24, 2025" },
                                        { name: "visionOS 2.4 final build", date: "March 31, 2025" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "visionOS 2.4.1", date: "April 16, 2025" }
                            ]
                        },
                        "2-5": {
                            label: "visionOS 2.5",
                            releases: [
                                { name: "visionOS 2.5 beta 1", date: "April 2, 2025", alignment: "left" },
                                { name: "visionOS 2.5 beta 2", date: "April 14, 2025", alignment: "right" },
                                { name: "visionOS 2.5 beta 3", date: "April 21, 2025", alignment: "left" },
                                { name: "visionOS 2.5 beta 4", date: "April 28, 2025", alignment: "right" },
                                {
                                    pair: [
                                        { name: "visionOS 2.5 RC build", date: "May 6, 2025" },
                                        { name: "visionOS 2.5 final build", date: "May 12, 2025" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ]
                        },
                        "2-6": {
                            label: "visionOS 2.6",
                            releases: [
                                { name: "visionOS 2.6 beta 1", date: "June 16, 2025", alignment: "left" },
                                { name: "visionOS 2.6 beta 2", date: "June 30, 2025", alignment: "right" },
                                { name: "visionOS 2.6 beta 3", date: "July 14, 2025", spanTwo: true },
                                {
                                    pair: [
                                        { name: "visionOS 2.6 RC build", date: "July 21, 2025" },
                                        { name: "visionOS 2.6 final build", date: "July 29, 2025" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                    };
            initializeTimelinePage(timelines);
        },
        "visionos-26.html": () => {
            const timelines = {
                        "26-0": {
                            label: "visionOS 26.0",
                            releases: [
                                { name: "visionOS 26.0 beta 1", date: "June 9, 2025", alignment: "left" },
                                { name: "visionOS 26.0 beta 2", date: "June 23, 2025", alignment: "right" },
                                { name: "visionOS 26.0 beta 3", date: "July 7, 2025", alignment: "left" },
                                { name: "visionOS 26.0 beta 4", date: "July 22, 2025", alignment: "right" },
                                { name: "visionOS 26.0 beta 5", date: "August 5, 2025", alignment: "left" },
                                { name: "visionOS 26.0 beta 6", date: "August 11, 2025", alignment: "right" },
                                { name: "visionOS 26.0 beta 7", date: "August 18, 2025", alignment: "left" },
                                { name: "visionOS 26.0 beta 8", date: "August 25, 2025", alignment: "right" },
                                { name: "visionOS 26.0 beta 9", date: "September 2, 2025", spanTwo: true },
                                {
                                    pair: [
                                        { name: "visionOS 26.0 RC build", date: "September 9, 2025" },
                                        { name: "visionOS 26.0 final build", date: "September 15, 2025" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "visionOS 26.0.1", date: "September 29, 2025" }
                            ]
                        },
                        "26-1": {
                            label: "visionOS 26.1",
                            releases: [
                                { name: "visionOS 26.1 beta 1", date: "September 22, 2025", alignment: "left" },
                                { name: "visionOS 26.1 beta 2", date: "October 6, 2025", alignment: "right" },
                                { name: "visionOS 26.1 beta 3", date: "October 13, 2025", alignment: "left" },
                                { name: "visionOS 26.1 beta 4", date: "October 20, 2025", alignment: "right" },
                                {
                                    pair: [
                                        { name: "visionOS 26.1 RC build", date: "October 28, 2025" },
                                        { name: "visionOS 26.1 final build", date: "November 3, 2025" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ]
                        },
                        "26-2": {
                            label: "visionOS 26.2",
                            releases: [
                                { name: "iOS 26.2 beta 1", date: "November 4, 2025", alignment: "left" },
                                { name: "iOS 26.2 beta 2", date: "November 12, 2025", alignment: "right" },
                                { name: "iOS 26.2 beta 3", date: "November 17, 2025", spanTwo: true },
                                {
                                    pair: [
                                        { name: "visionOS 26.2 RC build", date: "December 3, 2025" },
                                        { name: "visionOS 26.2 final build", date: "December 12, 2025" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "26-3": {
                            label: "visionOS 26.3",
                            releases: [
                                { name: "visionOS 26.3 beta 1", date: "December 15, 2025", alignment: "left" },
                                { name: "visionOS 26.3 beta 2", date: "January 12, 2026", alignment: "right" },
                                { name: "visionOS 26.3 beta 3", date: "January 26, 2026", spanTwo: true },
                                {
                                    pair: [
                                        { name: "visionOS 26.3 RC build", date: "February 4, 2026" },
                                        { name: "visionOS 26.3 final build", date: "February 11, 2026" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "visionOS 26.3.1", date: "February 26, 2026" }
                            ]
                        },
                        "26-4": {
                            label: "visionOS 26.4",
                            releases: [
                                { name: "visionOS 26.4 beta 1", date: "February 16, 2026", alignment: "left" },
                                { name: "visionOS 26.4 beta 2", date: "February 23, 2026", alignment: "right" },
                                { name: "visionOS 26.4 beta 3", date: "March 2, 2026", alignment: "left" },
                                { name: "visionOS 26.4 beta 4", date: "March 9, 2026", alignment: "right" },
                                {
                                    pair: [
                                        { name: "visionOS 26.4 RC build", date: "March 18, 2026" },
                                        { name: "visionOS 26.4 final build", date: "March 24, 2026" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "26-5": {
                            label: "visionOS 26.5",
                            releases: [
                                { name: "visionOS 26.5 beta 1", date: "March 30, 2026", alignment: "left" },
                                { name: "visionOS 26.5 beta 2", date: "April 13, 2026", alignment: "right" },
                                { name: "visionOS 26.5 beta 3", date: "April 20, 2026", alignment: "left" },
                                { name: "visionOS 26.5 beta 4", date: "April 27, 2026", alignment: "right" },
                                {
                                    pair: [
                                        { name: "visionOS 26.5 RC build", date: "May 4, 2026" },
                                        { name: "visionOS 26.5 final build", date: "May 11, 2026" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "26-6": {
                            label: "visionOS 26.6",
                            releases: [
                                { name: "visionOS 26.6 beta 1", date: "May 26, 2026", alignment: "left" },
                                { name: "visionOS 26.6 beta 2", date: "June 15, 2026", alignment: "right" },
                                { name: "visionOS 26.6 beta 3", date: "June 29, 2026", alignment: "left" },
                                { name: "visionOS 26.6 beta 4", date: "July 6, 2026", alignment: "right" },
                                { name: "visionOS 26.6 beta 5", date: "July 13, 2026", spanTwo: true },
                                {
                                    pair: [
                                        { name: "visionOS 26.6 RC build", date: "July 20, 2026" },
                                        { name: "visionOS 26.6 final build", date: "July 27, 2026" }
            
                                    ],
                                    className: "release-pair-builds"
                                },
                            ],
                            supplemental: [
                                { name: "visionOS 26.6.1", date: "August 17, 2026" },
                            ]
                        },
                    };
            initializeTimelinePage(timelines);
        },
        "visionos-27.html": () => {
            const timelines = {
                        "27-0": {
                            label: "visionOS 27.0",
                            releases: [
                                { name: "visionOS 27.0 beta 1", date: "June 8, 2026", alignment: "left" },
                                { name: "visionOS 27.0 beta 2", date: "June 22, 2026", alignment: "right" },
                                { name: "visionOS 27.0 beta 3", date: "July 6, 2026", alignment: "left" },
                                { name: "visionOS 27.0 beta 4", date: "July 20, 2026", alignment: "right" },
                                { name: "visionOS 27.0 beta 5", date: "August 10, 2026", alignment: "left" },
                                { name: "visionOS 27.0 beta 6", date: "August 17, 2026", alignment: "right" },
                                { name: "visionOS 27.0 beta 7", date: "August 24, 2026", alignment: "left" },
                                { name: "visionOS 27.0 beta 8", date: "August 31, 2026", alignment: "right" },
                                {
                                    pair: [
                                        { name: "visionOS 27.0 RC build", date: "September 9, 2026" },
                                        { name: "visionOS 27.0 final build", date: "September 14, 2026" },
                                    ],
                                    className: "release-pair-builds",
                                }
                            ]
                        },
                        "27-2": {
                            label: "visionOS 27.2",
                            releases: [
                                { name: "visionOS 27.2 beta 1", date: "September 16, 2026", alignment: "left" },
                                { name: "visionOS 27.2 beta 2", date: "September 21, 2026", alignment: "right" },
                                { name: "visionOS 27.2 beta 3", date: "October 5, 2026", alignment: "left" },
                                { name: "visionOS 27.2 beta 4", date: "October 13, 2026", alignment: "right" },
                                {
                                    pair: [
                                        { name: "visionOS 27.2 RC build", date: "October 19, 2026" },
                                        { name: "visionOS 27.2 final build", date: "October 26, 2026" },
                                    ],
                                    className: "release-pair-builds"
                                },
                            ],
                            supplemental: [
                                { name: "visionOS 27.2.1", date: "November 9, 2026" }
                            ]
                        },
                        "27-3": {
                            label: "visionOS 27.3",
                            releases: [
                                { name: "visionOS 27.3 beta 1", date: "November 3, 2026" },
                            ]
                        }
                    };
            initializeTimelinePage(timelines);
        },
        "watchos-1.html": () => {
            const timelines = {
                        "1-0": {
                            label: "watchOS 1.0",
                            releases: [
                                {
                                    pair: [
                                        { name: "watchOS 1.0", date: "April 24, 2015" },
                                        { name: "watchOS 1.0.1", date: "May 19, 2015" },
                                    ],
                                    className: "release-pair-builds"
                                },
                            ],
                        },
                    };
            initializeTimelinePage(timelines);
        },
        "watchos-10.html": () => {
            const timelines = {
                        "10-0": {
                            label: "watchOS 10.0",
                            releases: [
                                { name: "watchOS 10.0 beta 1", date: "June 5, 2023", alignment: "left" },
                                { name: "watchOS 10.0 beta 2", date: "June 21, 2023", alignment: "right" },
                                { name: "watchOS 10.0 beta 3", date: "July 5, 2023", alignment: "left" },
                                { name: "watchOS 10.0 beta 4", date: "July 25, 2023", alignment: "right" },
                                { name: "watchOS 10.0 beta 5", date: "August 8, 2023", alignment: "left" },
                                { name: "watchOS 10.0 beta 6", date: "August 15, 2023", alignment: "right" },
                                { name: "watchOS 10.0 beta 7", date: "August 22, 2023", alignment: "left" },
                                { name: "watchOS 10.0 beta 8", date: "August 29, 2023", alignment: "right" },
                                {
                                    pair: [
                                        { name: "watchOS 10.0 RC build", date: "September 12, 2023" },
                                        { name: "watchOS 10.0 final build", date: "September 18, 2023" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                {
                                    pair: [
                                        { name: "watchOS 10.0.1", date: "September 21, 2023" },
                                        { name: "watchOS 10.0.2", date: "September 26, 2023" },
                                    ],
                                    className: "release-pair-tight"
                                }
                            ]
                        },
                        "10-1": {
                            label: "watchOS 10.1",
                            releases: [
                                { name: "watchOS 10.1 beta 1", date: "September 27, 2023", alignment: "left" },
                                { name: "watchOS 10.1 beta 2", date: "October 3, 2023", alignment: "right" },
                                { name: "watchOS 10.1 beta 3", date: "October 10, 2023", spanTwo: true },
                                {
                                    pair: [
                                        { name: "watchOS 10.1 RC build", date: "October 17, 2023" },
                                        { name: "watchOS 10.1 final build", date: "October 25, 2023" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "watchOS 10.1.1", date: "November 7, 2023" },
                            ]
                        },
                        "10-2": {
                            label: "watchOS 10.2",
                            releases: [
                                { name: "watchOS 10.2 beta 1", date: "October 26, 2023", alignment: "left" },
                                { name: "watchOS 10.2 beta 2", date: "November 9, 2023", alignment: "right" },
                                { name: "watchOS 10.2 beta 3", date: "November 14, 2023", alignment: "left" },
                                { name: "watchOS 10.2 beta 4", date: "November 28, 2023", alignment: "right" },
                                {
                                    pair: [
                                        { name: "watchOS 10.2 RC build", date: "December 5, 2023" },
                                        { name: "watchOS 10.2 final build", date: "December 11, 2023" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "watchOS 10.2.1", date: "December 19, 2023" }
                            ]
                        },
                        "10-3": {
                            label: "watchOS 10.3",
                            releases: [
                                { name: "watchOS 10.3 beta 1", date: "December 12, 2023", alignment: "left" },
                                { name: "watchOS 10.3 beta 2", date: "January 3, 2024", alignment: "right" },
                                { name: "watchOS 10.3 beta 3", date: "January 9, 2024", spanTwo: true },
                                {
                                    pair: [
                                        { name: "watchOS 10.3 RC build", date: "January 17, 2024" },
                                        { name: "watchOS 10.3 final build", date: "January 22, 2024" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "watchOS 10.3.1", date: "February 8, 2024" },
                            ]
                        },
                        "10-4": {
                            label: "watchOS 10.4",
                            releases: [
                                { name: "watchOS 10.4 beta 1", date: "January 29, 2024", alignment: "left" },
                                { name: "watchOS 10.4 beta 2", date: "February 6, 2024", alignment: "right" },
                                { name: "watchOS 10.4 beta 3", date: "February 13, 2024", alignment: "left" },
                                { name: "watchOS 10.4 beta 4", date: "February 20, 2024", alignment: "right" },
                                {
                                    pair: [
                                        { name: "iOS 17.4 RC build", date: "February 27, 2024" },
                                        { name: "iOS 17.4 final build", date: "March 5, 2024" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "10-5": {
                            label: "watchOS 10.5",
                            releases: [
                                { name: "watchOS 10.5 beta 1", date: "April 2, 2024", alignment: "left" },
                                { name: "watchOS 10.5 beta 2", date: "April 16, 2024", alignment: "right" },
                                { name: "watchOS 10.5 beta 3", date: "April 23, 2024", alignment: "left" },
                                { name: "watchOS 10.5 beta 4", date: "April 30, 2024", alignment: "right" },
                                {
                                    pair: [
                                        { name: "watchOS 10.5 RC build", date: "May 7, 2024" },
                                        { name: "watchOS 10.5 final build", date: "May 13, 2024" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "10-6": {
                            label: "watchOS 10.6",
                            releases: [
                                { name: "watchOS 10.6 beta 1", date: "June 17, 2024", alignment: "left" },
                                { name: "watchOS 10.6 beta 2", date: "July 1, 2024", alignment: "right" },
                                { name: "watchOS 10.6 beta 3", date: "July 9, 2024", alignment: "left" },
                                { name: "watchOS 10.6 beta 4", date: "July 16, 2024", alignment: "right"},
                                {
                                    pair: [
                                        { name: "watchOS 10.6 RC build", date: "July 23, 2024" },
                                        { name: "watchOS 10.6 final build", date: "July 29, 2024" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                {
                                    pair: [
                                        { name: "watchOS 10.6.1", date: "August 19, 2024" },
                                        { name: "watchOS 10.6.2", date: "February 2, 2026" },
                                    ],
                                    className: "release-pair-tight"
                                }
                            ],
                        },
                    };
            initializeTimelinePage(timelines);
        },
        "watchos-11.html": () => {
            const timelines = {
                        "11-0": {
                            label: "watchOS 11.0",
                            releases: [
                                { name: "watchOS 11.0 beta 1", date: "June 10, 2024", alignment: "left" },
                                { name: "watchOS 11.0 beta 2", date: "June 24, 2024", alignment: "right" },
                                { name: "watchOS 11.0 beta 3", date: "July 8, 2024", alignment: "left" },
                                { name: "watchOS 11.0 beta 4", date: "July 23, 2024", alignment: "right" },
                                { name: "watchOS 11.0 beta 5", date: "August 5, 2024", alignment: "left" },
                                { name: "watchOS 11.0 beta 6", date: "August 12, 2024", alignment: "right" },
                                { name: "watchOS 11.0 beta 7", date: "August 20, 2024", spanTwo: true },
                                {
                                    pair: [
                                        { name: "watchOS 11.0 RC build", date: "September 9, 2024" },
                                        { name: "watchOS 11.0 final build", date: "September 16, 2024" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "watchOS 11.0.1", date: "October 3, 2024" }
                            ]
                        },
                        "11-1": {
                            label: "watchOS 11.1",
                            releases: [
                                { name: "watchOS 11.1 beta 1", date: "September 17, 2024", alignment: "left" },
                                { name: "watchOS 11.1 beta 2", date: "September 23, 2024", alignment: "right" },
                                { name: "watchOS 11.1 beta 3", date: "October 1, 2024", alignment: "left" },
                                { name: "watchOS 11.1 beta 4", date: "October 7, 2024", alignment: "right" },
                                { name: "watchOS 11.1 beta 5", date: "October 14, 2024", spanTwo: true },
                                {
                                    pair: [
                                        { name: "iOS 18.1 RC build", date: "October 21, 2024" },
                                        { name: "iOS 18.1 final build", date: "October 28, 2024" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "11-2": {
                            label: "watchOS 11.2",
                            releases: [
                                { name: "watchOS 11.2 beta 1", date: "November 4, 2024", alignment: "right" },
                                { name: "watchOS 11.2 beta 2", date: "November 11, 2024", alignment: "left" },
                                { name: "watchOS 11.2 beta 3", date: "November 20, 2024", spanTwo: true },
                                {
                                    pair: [
                                        { name: "watchOS 11.2 RC build", date: "December 5, 2024" },
                                        { name: "watchOS 11.2 final build", date: "December 11, 2024" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "11-3": {
                            label: "watchOS 11.3",
                            releases: [
                                { name: "watchOS 11.3 beta 1", date: "December 16, 2024", alignment: "left" },
                                { name: "watchOS 11.3 beta 2", date: "January 7, 2025", alignment: "right" },
                                { name: "watchOS 11.3 beta 3", date: "January 16, 2025", spanTwo: true },
                                {
                                    pair: [
                                        { name: "watchOS 11.3 RC build", date: "January 21, 2025" },
                                        { name: "watchOS 11.3 final build", date: "January 27, 2025" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "watchOS 11.3.1", date: "February 10, 2025" },
                            ]
                        },
                        "11-4": {
                            label: "watchOS 11.4",
                            releases: [
                                { name: "watchOS 11.4 beta 1", date: "February 21, 2025", alignment: "left" },
                                { name: "watchOS 11.4 beta 2", date: "March 3, 2025", alignment: "right" },
                                { name: "watchOS 11.4 beta 3", date: "March 10, 2025", alignment: "left" },
                                { name: "watchOS 11.4 beta 4", date: "March 17, 2025", alignment: "right" },
                                {
                                    pair: [
                                        { name: "watchOS 11.4 RC build", date: "March 24, 2025" },
                                        { name: "watchOS 11.4 final build", date: "March 31, 2025" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "11-5": {
                            label: "watchOS 11.5",
                            releases: [
                                { name: "watchOS 11.5 beta 1", date: "April 2, 2025", alignment: "left" },
                                { name: "watchOS 11.5 beta 2", date: "April 14, 2025", alignment: "right" },
                                { name: "watchOS 11.5 beta 3", date: "April 21, 2025", alignment: "left" },
                                { name: "watchOS 11.5 beta 4", date: "April 28, 2025", alignment: "right" },
                                {
                                    pair: [
                                        { name: "watchOS 11.5 RC build", date: "May 6, 2025" },
                                        { name: "watchOS 11.5 final build", date: "May 12, 2025" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ]
                        },
                        "11-6": {
                            label: "watchOS 11.6",
                            releases: [
                                { name: "watchOS 11.6 beta 1", date: "June 16, 2025", alignment: "left" },
                                { name: "watchOS 11.6 beta 2", date: "June 30, 2025", alignment: "right" },
                                { name: "watchOS 11.6 beta 3", date: "July 14, 2025", spanTwo: true },
                                {
                                    pair: [
                                        { name: "watchOS 11.6 RC build", date: "July 21, 2025" },
                                        { name: "watchOS 11.6 final build", date: "July 29, 2025" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                {
                                    pair: [
                                        { name: "watchOS 11.6.1", date: "August 14, 2025" },
                                        { name: "watchOS 11.6.2", date: "February 5, 2026" },
                                    ],
                                    className: "release-pair-tight"
                                }
                            ]
                        },
                    };
            initializeTimelinePage(timelines);
        },
        "watchos-2.html": () => {
            const timelines = {
                        "2-0": {
                            label: "watchOS 2.0",
                            releases: [
                                { name: "watchOS 2.0 beta 1", date: "June 8, 2015", alignment: "left" },
                                { name: "watchOS 2.0 beta 2", date: "June 23, 2015", note: "build 2: June 30, 2015", alignment: "right" },
                                { name: "watchOS 2.0 beta 3", date: "July 8, 2015", note: "build 2: July 15, 2015", alignment: "left" },
                                { name: "watchOS 2.0 beta 4", date: "July 21, 2015", alignment: "right" },
                                { name: "watchOS 2.0 beta 5", date: "August 6, 2015", spanTwo: true },
                                {
                                    pair: [
                                        { name: "watchOS 2.0 GM build", date: "September 9, 2015" },
                                        { name: "watchOS 2.0 final build", date: "September 21, 2015" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "watchOS 2.0.1", date: "October 21, 2015" },
                            ]
                        },
                        "2-1": {
                            label: "watchOS 2.1",
                            releases: [
                                { name: "watchOS 2.1", date: "December 8, 2015", spanTwo: true }
                            ],
                        },
                        "2-2-x": {
                            label: "watchOS 2.2.x",
                            releases: [
                                { name: "watchOS 2.2 beta 1", date: "January 11, 2016", alignment: "left" },
                                { name: "watchOS 2.2 beta 2", date: "January 25, 2016", alignment: "right" },
                                { name: "watchOS 2.2 beta 3", date: "February 8, 2016", alignment: "left" },
                                { name: "watchOS 2.2 beta 4", date: "February 22, 2016", alignment: "right" },
                                { name: "watchOS 2.2 beta 5", date: "March 1, 2016", alignment: "left" },
                                { name: "watchOS 2.2 beta 6", date: "March 7, 2016", alignment: "right" },
                                { name: "watchOS 2.2 final build", date: "March 21, 2016", spanTwo: true }
                            ],
                            supplemental: [
                                {
                                    pair: [
                                        { date: "watchOS 2.2.1", note: "beta 1: Apr 6, 2016\nGM build: Apr 20, 2016\nFinal build: May 16, 2016" },
                                        { date: "watchOS 2.2.2", note: "GM build: Jun 6, 2016\nFinal build: Jul 18, 2016" },
                                    ],
                                    className: "release-pair-builds"
                                }
                            ]
                        },
                    };
            initializeTimelinePage(timelines);
        },
        "watchos-26.html": () => {
            const timelines = {
                        "26-0": {
                            label: "watchOS 26.0",
                            releases: [
                                { name: "watchOS 26.0 beta 1", date: "Jun 9, 2025" },
                                { name: "watchOS 26.0 beta 2", date: "Jun 23, 2025" },
                                { name: "watchOS 26.0 beta 3", date: "Jul 7, 2025" },
                                { name: "watchOS 26.0 beta 4", date: "Jul 22, 2025" },
                                { name: "watchOS 26.0 beta 5", date: "Aug 5, 2025" },
                                { name: "watchOS 26.0 beta 6", date: "Aug 11, 2025" },
                                { name: "watchOS 26.0 beta 7", date: "Aug 18, 2025" },
                                { name: "watchOS 26.0 beta 8", date: "Aug 25, 2025" },
                                { name: "watchOS 26.0 beta 9", date: "Sep 2, 2025", spanTwo: true },
                                {
                                    pair: [
                                        { name: "watchOS 26.0 RC build", date: "Sep 9, 2025" },
                                        { name: "watchOS 26.0 final build", date: "Sep 15, 2025" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "watchOS 26.0.2", date: "Sep 29, 2025" }
                            ]
                        },
                        "26-1": {
                            label: "watchOS 26.1",
                            releases: [
                                { name: "watchOS 26.1 beta 1", date: "Sep 22, 2025" },
                                { name: "watchOS 26.1 beta 2", date: "Oct 6, 2025" },
                                { name: "watchOS 26.1 beta 3", date: "Oct 13, 2025" },
                                { name: "watchOS 26.1 beta 4", date: "Oct 20, 2025" },
                                {
                                    pair: [
                                        { name: "watchOS 26.1 RC build", date: "Oct 28, 2025" },
                                        { name: "watchOS 26.1 final build", date: "Nov 3, 2025" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ]
                        },
                        "26-2": {
                            label: "watchOS 26.2",
                            releases: [
                                { name: "watchOS 26.2 beta 1", date: "Nov 4, 2025" },
                                { name: "watchOS 26.2 beta 2", date: "Nov 12, 2025" },
                                { name: "watchOS 26.2 beta 3", date: "Nov 17, 2025", spanTwo: true },
                                {
                                    pair: [
                                        { name: "watchOS 26.2 RC build", date: "Dec 3, 2025" },
                                        { name: "watchOS 26.2 final build", date: "Dec 12, 2025" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "watchOS 26.2.1", date: "Jan 26, 2026" }
                            ]
                        },
                        "26-3": {
                            label: "watchOS 26.3",
                            releases: [
                                { name: "watchOS 26.3 beta 1", date: "Dec 15, 2025" },
                                { name: "watchOS 26.3 beta 2", date: "Jan 12, 2026" },
                                { name: "watchOS 26.3 beta 3", date: "Jan 26, 2026", spanTwo: true },
                                {
                                    pair: [
                                        { name: "watchOS 26.3 RC build", date: "Feb 4, 2026" },
                                        { name: "watchOS 26.3 final build", date: "Feb 11, 2026" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "26-4": {
                            label: "watchOS 26.4",
                            releases: [
                                { name: "watchOS 26.4 beta 1", date: "Feb 16, 2026" },
                                { name: "watchOS 26.4 beta 2", date: "Feb 23, 2026" },
                                { name: "watchOS 26.4 beta 3", date: "Mar 2, 2026", note: "build 2: Mar 5, 2026" },
                                { name: "watchOS 26.4 beta 4", date: "Mar 9, 2026" },
                                {
                                    pair: [
                                        { name: "watchOS 26.4 RC build", date: "Mar 18, 2026" },
                                        { name: "watchOS 26.4 final build", date: "Mar 24, 2026" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "26-5": {
                            label: "watchOS 26.5",
                            releases: [
                                { name: "watchOS 26.5 beta 1", date: "Mar 30, 2026" },
                                { name: "watchOS 26.5 beta 2", date: "Apr 13, 2026" },
                                { name: "watchOS 26.5 beta 3", date: "Apr 20, 2026" },
                                { name: "watchOS 26.5 beta 4", date: "Apr 27, 2026" },
                                {
                                    pair: [
                                        { name: "watchOS 26.5 RC build", date: "May 4, 2026" },
                                        { name: "watchOS 26.5 final build", date: "May 11, 2026" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "26-6": {
                            label: "watchOS 26.6",
                            releases: [
                                { name: "watchOS 26.6 beta 1", date: "May 26, 2026" },
                                { name: "watchOS 26.6 beta 2", date: "Jun 15, 2026" },
                                { name: "watchOS 26.6 beta 3", date: "Jun 29, 2026" },
                                { name: "watchOS 26.6 beta 4", date: "Jul 6, 2026" },
                                { name: "watchOS 26.6 beta 5", date: "Jul 13, 2026", spanTwo: true },
                                {
                                    pair: [
                                        { name: "watchOS 26.6 RC build", date: "Jul 20, 2026" },
                                        { name: "watchOS 26.6 final build", date: "Jul 27, 2026" }
            
                                    ],
                                    className: "release-pair-builds"
                                },
                            ],
                            supplemental: [
                                { name: "watchOS 26.6.1", date: "Nov 9, 2026" },
                            ]
                        },
                    };
            initializeTimelinePage(timelines);
        },
        "watchos-27.html": () => {
            const timelines = {
                        "27-0": {
                            label: "watchOS 27.0",
                            releases: [
                                { name: "watchOS 27.0 beta 1", date: "Jun 8, 2026" },
                                { name: "watchOS 27.0 beta 2", date: "Jun 22, 2026" },
                                { name: "watchOS 27.0 beta 3", date: "Jul 6, 2026" },
                                { name: "watchOS 27.0 beta 4", date: "Jul 20, 2026" },
                                { name: "watchOS 27.0 beta 5", date: "Aug 10, 2026" },
                                { name: "watchOS 27.0 beta 6", date: "Aug 17, 2026" },
                                { name: "watchOS 27.0 beta 7", date: "Aug 24, 2026" },
                                { name: "watchOS 27.0 beta 8", date: "Aug 31, 2026" },
                                {
                                    pair: [
                                        { name: "watchOS 27.0 RC build", date: "Sep 9, 2026" },
                                        { name: "watchOS 27.0 final build", date: "Sep 14, 2026" },
                                    ],
                                    className: "release-pair-builds"
                                },
                            ],
                        },
                        "27-2": {
                            label: "watchOS 27.2",
                            releases: [
                                { name: "watchOS 27.2 beta 1", date: "Sep 16, 2026" },
                                { name: "watchOS 27.2 beta 2", date: "Sep 21, 2026" },
                                { name: "watchOS 27.2 beta 3", date: "Oct 5, 2026" },
                                { name: "watchOS 27.2 beta 4", date: "Oct 13, 2026" },
                                {
                                    pair: [
                                        { name: "watchOS 27.2 RC build", date: "Oct 19, 2026", note: "build 2: Oct 23, 2026" },
                                        { name: "watchOS 27.2 final build", date: "Oct 26, 2026" },
                                    ],
                                    className: "release-pair-builds"
                                },
                            ],
                            supplemental: [
                                { name: "watchOS 27.2.1", date: "Nov 9, 2026" },
                            ]
                        },
                        "27-3": {
                            label: "watchOS 27.3",
                            releases: [
                                { name: "watchOS 27.3 beta 1", date: "Nov 3, 2026" }
                            ]
                        }
                    };
            initializeTimelinePage(timelines);
        },
        "watchos-3.html": () => {
            const timelines = {
                        "3-0": {
                            label: "watchOS 3.0",
                            releases: [
                                { name: "watchOS 3.0 beta 1", date: "June 13, 2016", alignment: "left" },
                                { name: "watchOS 3.0 beta 2", date: "July 5, 2016", alignment: "right" },
                                { name: "watchOS 3.0 beta 3", date: "July 18, 2016", alignment: "left" },
                                { name: "watchOS 3.0 beta 4", date: "August 1, 2016", alignment: "right" },
                                { name: "watchOS 3.0 beta 5", date: "August 9, 2016", alignment: "left" },
                                { name: "watchOS 3.0 beta 6", date: "August 15, 2016", alignment: "right" },
                                {
                                    pair: [
                                        { name: "watchOS 3.0 GM build", date: "September 7, 2016" },
                                        { name: "watchOS 3.0 final build", date: "September 13, 2016" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "3-1-x": {
                            label: "watchOS 3.1.x",
                            releases: [
                                { name: "watchOS 3.1 beta 1", date: "September 21, 2016", alignment: "left" },
                                { name: "watchOS 3.1 beta 2", date: "October 4, 2016", alignment: "right" },
                                { name: "watchOS 3.1 beta 3", date: "October 12, 2016", spanTwo: true },
                                { name: "watchOS 3.1 final build", date: "October 24, 2016", spanTwo: true }
                            ],
                            supplemental: [
                                {
                                    pair: [
                                        { date: "watchOS 3.1.1", note: "beta 1: Oct 31, 2016\nbeta 2: Nov 7, 2016\nbeta 3: Nov 14, 2016\nbeta 4: Nov 28, 2016\nbeta 5: Dec 5, 2016\nFinal build: Dec 12, 2016" },
                                        { date: "watchOS 3.1.3", note: "beta 1: Dec 14, 2016\nbeta 2: Jan 9, 2017\nFinal build: Jan 23, 2017" },
                                    ],
                                className: "release-pair-builds"
                                }
                            ]
                        },
                        "3-2-x": {
                            label: "watchOS 3.2.x",
                            releases: [
                                { name: "watchOS 3.2 beta 1", date: "January 30, 2017", alignment: "left" },
                                { name: "watchOS 3.2 beta 2", date: "February 6, 2017", alignment: "right" },
                                { name: "watchOS 3.2 beta 3", date: "February 20, 2017", alignment: "left" },
                                { name: "watchOS 3.2 beta 4", date: "February 27, 2017", alignment: "right" },
                                { name: "watchOS 3.2 beta 5", date: "March 8, 2017", alignment: "left" },
                                { name: "watchOS 3.2 beta 6", date: "March 14, 2017", alignment: "right" },
                                { name: "watchOS 3.2 beta 7", date: "March 20, 2017", spanTwo: true },
                                { name: "watchOS 3.2 final build", date: "March 27, 2017", spanTwo: true }
                            ],
                            supplemental: [
                                {
                                    pair: [
                                        { date: "watchOS 3.2.2", note: "beta 1: Mar 28, 2017\nbeta 2: Apr 10, 2017\nbeta 3: Apr 17, 2017\nbeta 4: Apr 24, 2017\nFinal build: May 15, 2017" },
                                        { date: "watchOS 3.2.3", note: "beta 1: May 16, 2017\nbeta 2: May 30, 2017\nbeta 3: Jun 13, 2017\nbeta 4: Jun 26, 2017\nFinal build: Jul 19, 2017" },
                                    ],
                                    className: "release-pair-builds"
                                }
                            ]
                        },
                    };
            initializeTimelinePage(timelines);
        },
        "watchos-4.html": () => {
            const timelines = {
                        "4-0": {
                            label: "watchOS 4.0",
                            releases: [
                                { name: "watchOS 4.0 beta 1", date: "June 5, 2017", alignment: "left" },
                                { name: "watchOS 4.0 beta 2", date: "June 21, 2017", alignment: "right" },
                                { name: "watchOS 4.0 beta 3", date: "July 13, 2017", alignment: "left" },
                                { name: "watchOS 4.0 beta 4", date: "July 24, 2017", alignment: "right" },
                                { name: "watchOS 4.0 beta 5", date: "August 7, 2017", alignment: "left" },
                                { name: "watchOS 4.0 beta 6", date: "August 14, 2017", alignment: "right" },
                                { name: "watchOS 4.0 beta 7", date: "August 21, 2017", alignment: "left" },
                                { name: "watchOS 4.0 beta 8", date: "August 28, 2017", alignment: "right" },
                                {
                                    pair: [
                                        { name: "watchOS 4.0 GM build", date: "September 12, 2017" },
                                        { name: "watchOS 4.0 final build", date: "September 19, 2017" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "watchOS 4.0.1", date: "October 4, 2017" },
                            ]
                        },
                        "4-1": {
                            label: "watchOS 4.1",
                            releases: [
                                { name: "watchOS 4.1 beta 1", date: "September 27, 2017", alignment: "left" },
                                { name: "watchOS 4.1 beta 2", date: "October 9, 2017", alignment: "right" },
                                { name: "watchOS 4.1 beta 3", date: "October 16, 2017", spanTwo: true },
                                {
                                    pair: [
                                        { name: "watchOS 4.1 GM build", date: "October 20, 2017" },
                                        { name: "watchOS 4.1 final build", date: "October 31, 2017" },
                                    ],
                                    className: "release-pair-builds"
                                },
                            ],
                        },
                        "4-2": {
                            label: "watchOS 4.2",
                            releases: [
                                { name: "watchOS 4.2 beta 1", date: "October 30, 2017", alignment: "left" },
                                { name: "watchOS 4.2 beta 2", date: "November 6, 2017", alignment: "right" },
                                { name: "watchOS 4.2 beta 3", date: "November 13, 2017", alignment: "left" },
                                { name: "watchOS 4.2 beta 4", date: "November 17, 2017", alignment: "right" },
                                { name: "watchOS 4.2 final build", date: "December 5, 2017", spanTwo: true }
                            ],
                            supplemental: [
                                {
                                    pair: [
                                        { date: "watchOS 4.2.2", note: "beta 1: Dec 13, 2017\nbeta 2: Dec 19, 2017\nbeta 3: Jan 3, 2018\nbeta 4: Jan 9, 2018\nbeta 5: Jan 19, 2018\nFinal build: Jan 24, 2018" },
                                        { date: "watchOS 4.2.3", note: "Final build: Feb 19, 2018" },
                                    ],
                                    className: "release-pair-tight"
                                }
                            ]
                        },
                        "4-3": {
                            label: "watchOS 4.3",
                            releases: [
                                { name: "watchOS 4.3 beta 1", date: "January 24, 2018", alignment: "left" },
                                { name: "watchOS 4.3 beta 2", date: "February 7, 2018", alignment: "right" },
                                { name: "watchOS 4.3 beta 3", date: "February 21, 2018", alignment: "left" },
                                { name: "watchOS 4.3 beta 4", date: "March 6, 2018", alignment: "right" },
                                { name: "watchOS 4.3 beta 5", date: "March 12, 2018", alignment: "left" },
                                { name: "watchOS 4.3 beta 6", date: "March 16, 2018", alignment: "right" },
                                { name: "watchOS 4.3 final build", date: "March 29, 2018", spanTwo: true }
                            ],
                            supplemental: [
                                { date: "watchOS 4.3.1", note: "beta 1: Apr 2, 2018\nbeta 2: Apr 16, 2018\nbeta 3: May 1, 2018\nbeta 4: May 7, 2018\nbeta 5: May 14, 2018\nFinal build: May 29, 2018" }
                            ]
                        },
                        "4-3-2": {
                            label: "watchOS 4.3.2",
                            releases: [
                                { name: "watchOS 4.3.2 beta 1", date: "May 30, 2018", alignment: "left" },
                                { name: "watchOS 4.3.2 beta 2", date: "June 13, 2018", alignment: "right" },
                                { name: "watchOS 4.3.2 beta 3", date: "June 25, 2018", spanTwo: true },
                                { name: "watchOS 4.3.2 final build", date: "July 9, 2018", spanTwo: true },
                            ]
                        },
                    };
            initializeTimelinePage(timelines);
        },
        "watchos-5.html": () => {
            const timelines = {
                        "5-0": {
                            label: "watchOS 5.0",
                            releases: [
                                { name: "watchOS 5.0 beta 1", date: "June 4, 2018", note: "build 2: June 11, 2018", alignment: "left" },
                                { name: "watchOS 5.0 beta 2", date: "June 19, 2018", alignment: "right" },
                                { name: "watchOS 5.0 beta 3", date: "July 3, 2018", alignment: "left" },
                                { name: "watchOS 5.0 beta 4", date: "July 17, 2018", alignment: "right" },
                                { name: "watchOS 5.0 beta 5", date: "July 30, 2018", alignment: "left" },
                                { name: "watchOS 5.0 beta 6", date: "August 6, 2018", alignment: "right" },
                                { name: "watchOS 5.0 beta 7", date: "August 13, 2018", alignment: "left" },
                                { name: "watchOS 5.0 beta 8", date: "August 20, 2018", alignment: "right" },
                                { name: "watchOS 5.0 beta 9", date: "August 24, 2018", alignment: "left" },
                                { name: "watchOS 5.0 beta 10", date: "August 31, 2018", alignment: "right" },
                                {
                                    pair: [
                                        { name: "watchOS 5.0 GM build", date: "September 12, 2018" },
                                        { name: "watchOS 5.0 final build", date: "September 17, 2018" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "watchOS 5.0.1", date: "September 27, 2018" }
                            ]
                        },
                        "5-1": {
                            label: "watchOS 5.1",
                            releases: [
                                { name: "watchOS 5.1 beta 1", date: "September 18, 2018", alignment: "left" },
                                { name: "watchOS 5.1 beta 2", date: "October 2, 2018", alignment: "right" },
                                { name: "watchOS 5.1 beta 3", date: "October 9, 2018", alignment: "left" },
                                { name: "watchOS 5.1 beta 4", date: "October 15, 2018", alignment: "right" },
                                { name: "watchOS 5.1 beta 5", date: "October 22, 2018", spanTwo: true },
                                { name: "watchOS 5.1 final build", date: "October 30, 2018", spanTwo: true },
                            ],
                            supplemental: [
                                { name: "watchOS 5.1.1", date: "November 5, 2018" }
                            ]
                        },
                        "5-1-2": {
                            label: "watchOS 5.1.2",
                            releases: [
                                { name: "watchOS 5.1.2 beta 1", date: "November 7, 2018", alignment: "left" },
                                { name: "watchOS 5.1.2 beta 2", date: "November 15, 2018", alignment: "right" },
                                { name: "watchOS 5.1.2 final build", date: "December 5, 2018", spanTwo: true },
                            ],
                            supplemental: [
                                { date: "watchOS 5.1.3", note: "beta 1: Dec 10, 2018\nbeta 2: Dec 19, 2018\nbeta 3: Jan 7, 2019\nFinal build: Jan 22, 2019" },
                            ]
                        },
                        "5-2": {
                            label: "watchOS 5.2",
                            releases: [
                                { name: "watchOS 5.2 beta 1", date: "January 24, 2019", alignment: "left" },
                                { name: "watchOS 5.2 beta 2", date: "February 4, 2019", alignment: "right" },
                                { name: "watchOS 5.2 beta 3", date: "February 19, 2019", alignment: "left" },
                                { name: "watchOS 5.2 beta 4", date: "March 4, 2019", alignment: "right" },
                                { name: "watchOS 5.2 beta 5", date: "March 11, 2019", alignment: "left" },
                                { name: "watchOS 5.2 beta 6", date: "March 18, 2019", alignment: "right" },
                                { name: "watchOS 5.2 final build", date: "March 27, 2019", spanTwo: true },
                            ]
                        },
                        "5-2-1": {
                            label: "watchOS 5.2.1",
                            releases: [
                                { name: "watchOS 5.2.1 beta 1", date: "March 28, 2019", alignment: "left" },
                                { name: "watchOS 5.2.1 beta 2", date: "April 8, 2019", alignment: "right" },
                                { name: "watchOS 5.2.1 beta 3", date: "April 22, 2019", alignment: "left" },
                                { name: "watchOS 5.2.1 beta 4", date: "April 29, 2019", alignment: "right" },
                                { name: "watchOS 5.2.1 beta 5", date: "May 7, 2019", spanTwo: true },
                                { name: "watchOS 5.2.1 final build", date: "May 13, 2019", spanTwo: true },
                            ]
                        },
                        "5-3-x": {
                            label: "watchOS 5.3.x",
                            releases: [
                                {
                                    quad: [
                                        { date: "watchOS 5.3", note: "beta 1: May 15, 2019\nbeta 2: May 28, 2019\nbeta 3: Jun 11, 2019\nbeta 4: Jun 24, 2019\nbeta 5: Jul 9, 2019\nbeta 6: Jul 16, 2019\nFinal build: Jul 22, 2019" },
                                        { date: "watchOS 5.3.1", note: "Final build: Aug 26, 2019" },
                                        { date: "watchOS 5.3.2", note: "Series 1 + 2: Sep 26, 2019\nSeries 3: Sep 30, 2019\nSeries 4: Oct 9, 2019" },
                                        { date: "watchOS 5.3.3", note: "Final build: Oct 29, 2019" },
                                    ],
                                },
                                { 
                                    quad: [
                                        { date: "watchOS 5.3.4", note: "Final build: Dec 10, 2019" },
                                        { date: "watchOS 5.3.5", note: "Final build: Feb 18, 2020" },
                                        { date: "watchOS 5.3.6", note: "Final build: Mar 24, 2020" },
                                        { date: "watchOS 5.3.7", note: "Final build: May 18, 2020" },
                                    ],
                                },
                                { 
                                    trio: [
                                        { date: "watchOS 5.3.8", note: "Final build: Jul 15, 2020" },
                                        { date: "watchOS 5.3.9", note: "Final build: Nov 5, 2020" },
                                        { date: "watchOS 5.3.10", note: "Final build: Mar 24, 2026" },
                                    ],
                                },
                            ],
                        }
                    };
            initializeTimelinePage(timelines);
        },
        "watchos-6.html": () => {
            const timelines = {
                        "6-0": {
                            label: "watchOS 6.0",
                            releases: [
                                { name: "watchOS 6.0 beta 1", date: "June 3, 2019", alignment: "left" },
                                { name: "watchOS 6.0 beta 2", date: "June 17, 2019", alignment: "right" },
                                { name: "watchOS 6.0 beta 3", date: "July 2, 2019", alignment: "left" },
                                { name: "watchOS 6.0 beta 4", date: "July 17, 2019", alignment: "right" },
                                { name: "watchOS 6.0 beta 5", date: "July 30, 2019", alignment: "left" },
                                { name: "watchOS 6.0 beta 6", date: "August 7, 2019", alignment: "right" },
                                { name: "watchOS 6.0 beta 7", date: "August 15, 2019", alignment: "left" },
                                { name: "watchOS 6.0 beta 8", date: "August 21, 2019", alignment: "right" },
                                {
                                    pair: [
                                        { name: "watchOS 6.0 GM build", date: "September 10, 2019" },
                                        { name: "watchOS 6.0 final build", date: "September 19, 2019" }
                                    ],
                                    className: "release-pair-builds"
                                },
                            ],
                            supplemental: [
                                { name: "watchOS 6.0.1", date: "September 30, 2019" },
                            ]
                        },
                        "6-1-x": {
                            label: "watchOS 6.1.x",
                            releases: [
                                { name: "watchOS 6.1 beta 1", date: "September 23, 2019", alignment: "left" },
                                { name: "watchOS 6.1 beta 2", date: "October 2, 2019", alignment: "right" },
                                { name: "watchOS 6.1 beta 3", date: "October 10, 2019", alignment: "left" },
                                { name: "watchOS 6.1 beta 4", date: "October 16, 2019", alignment: "right" },
                                { name: "watchOS 6.1 beta 5", date: "October 23, 2019", spanTwo: true },
                                { name: "watchOS 6.1 final build", date: "October 29, 2019", spanTwo: true }
                            ],
                            supplemental: [
                                { 
                                    trio: [
                                        { date: "watchOS 6.1.1", note: "beta 1: Nov 5, 2019\nbeta 2: Nov 12, 2019\nbeta 3: Nov 20, 2019\nbeta 4: Dec 5, 2019\nFinal build: Dec 10, 2019" },
                                        { date: "watchOS 6.1.2", note: "beta 1: Dec 17, 2019\nbeta 2: Jan 14, 2020\nbeta 3: Jan 22, 2020\nFinal build: Jan 28, 2020" },
                                        { date: "watchOS 6.1.3", note: "Final build: Feb 18, 2020" },
                                    ],
                                    className: "release-trio-tight"
                                }
                            ]
                        },
                        "6-2": {
                            label: "watchOS 6.2",
                            releases: [
                                { name: "watchOS 6.2 beta 1", date: "February 5, 2020", alignment: "left" },
                                { name: "watchOS 6.2 beta 2", date: "February 19, 2020", alignment: "right" },
                                { name: "watchOS 6.2 beta 3", date: "February 26, 2020", alignment: "left" },
                                { name: "watchOS 6.2 beta 4", date: "March 4, 2020", alignment: "right" },
                                { name: "watchOS 6.2 beta 5", date: "March 11, 2020", alignment: "left" },
                                { name: "watchOS 6.2 beta 6", date: "March 18, 2020", alignment: "right" },
                                { name: "watchOS 6.2 final build", date: "March 24, 2020", spanTwo: true }
                            ],
                            supplemental: [
                                {
                                    pair: [
                                        { date: "watchOS 6.2.5", note: "beta 1: Apr 1, 2020\nbeta 2: Apr 15, 2020\nbeta 3: Apr 29, 2020\nbeta 4: May 6, 2020\nbeta 5: May 14, 2020\nFinal build: May 18, 2020" },
                                        { date: "watchOS 6.2.6", note: "Final build: Jun 1, 2020" },
                                    ],
                                    className: "release-pair-builds"
                                }
                            ]
                        },
                        "6-2-8": {
                            label: "watchOS 6.2.8",
                            releases: [
                                { name: "watchOS 6.2.8 beta 1", date: "June 3, 2020", alignment: "left" },
                                { name: "watchOS 6.2.8 beta 2", date: "June 10, 2020", alignment: "right" },
                                { name: "watchOS 6.2.8 beta 3", date: "June 30, 2020", spanTwo: "true" },
                                {
                                    pair: [
                                        { name: "watchOS 6.2.8 GM build", date: "July 9, 2020" },
                                        { name: "watchOS 6.2.8 final build", date: "July 15, 2020" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "watchOS 6.2.9", date: "November 5, 2020" }
                            ]
                        },
                        "6-3-x": {
                            label: "watchOS 6.3.x",
                            releases: [
                                {
                                    pair: [
                                        { date: "watchOS 6.3", note: "Series 1 + 2: Dec 14, 2020\nSeries 3-5: Jan 26, 2021" },
                                        { date: "watchOS 6.3.1", note: "Final build: Feb 2, 2026" },
                                    ],
                                    className: "release-pair-builds"
                                },
                            ]
                        },
                    };
            initializeTimelinePage(timelines);
        },
        "watchos-7.html": () => {
            const timelines = {
                        "7-0": {
                            label: "watchOS 7.0",
                            releases: [
                                { name: "watchOS 7.0 beta 1", date: "June 22, 2020", alignment: "left" },
                                { name: "watchOS 7.0 beta 2", date: "July 7, 2020", alignment: "right" },
                                { name: "watchOS 7.0 beta 3", date: "July 22, 2020", alignment: "left" },
                                { name: "watchOS 7.0 beta 4", date: "August 4, 2020", alignment: "right" },
                                { name: "watchOS 7.0 beta 5", date: "August 18, 2020", alignment: "left" },
                                { name: "watchOS 7.0 beta 6", date: "August 25, 2020", alignment: "right" },
                                { name: "watchOS 7.0 beta 7", date: "September 1, 2020", alignment: "left" },
                                { name: "watchOS 7.0 beta 8", date: "September 9, 2020", alignment: "right" },
                                {
                                    pair: [
                                        { name: "watchOS 7.0 GM build", date: "September 15, 2020" },
                                        { name: "watchOS 7.0 final build", date: "September 16, 2020" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                {
                                    trio: [
                                        { name: "watchOS 7.0.1", date: "September 24, 2020" },
                                        { name: "watchOS 7.0.2", date: "October 12, 2020" },
                                        { name: "watchOS 7.0.3", date: "October 19, 2020" },
                                    ]
                                }
                            ]
                        },
                        "7-1": {
                            label: "watchOS 7.1",
                            releases: [
                                { name: "watchOS 7.1 beta 1", date: "September 17, 2020", alignment: "left" },
                                { name: "watchOS 7.1 beta 2", date: "September 29, 2020", alignment: "right" },
                                { name: "watchOS 7.1 beta 3", date: "October 14, 2020", alignment: "left" },
                                { name: "watchOS 7.1 beta 4", date: "October 22, 2020", alignment: "right" },
                                {
                                    pair: [
                                        { name: "watchOS 7.1 RC build", date: "November 2, 2020" },
                                        { name: "watchOS 7.1 final build", date: "November 5, 2020" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "7-2": {
                            label: "watchOS 7.2",
                            releases: [
                                { name: "watchOS 7.2 beta 1", date: "November 12, 2020", alignment: "left" },
                                { name: "watchOS 7.2 beta 2", date: "November 18, 2020", alignment: "right" },
                                { name: "watchOS 7.2 beta 3", date: "December 2, 2020", spanTwo: true },
                                {
                                    pair: [
                                        { name: "watchOS 7.2 RC build", date: "December 8, 2020" },
                                        { name: "watchOS 7.2 final build", date: "December 14, 2020" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "7-3": {
                            label: "watchOS 7.3",
                            releases: [
                                { name: "watchOS 7.3 beta 1", date: "December 16, 2020", alignment: "left" },
                                { name: "watchOS 7.3 beta 2", date: "January 13, 2021", alignment: "right" },
                                {
                                    pair: [
                                        { name: "watchOS 7.3 RC build", date: "January 21, 2021" },
                                        { name: "watchOS 7.3 final build", date: "January 26, 2021" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { trio: [
                                        { name: "watchOS 7.3.1", date: "February 15, 2021" },
                                        { name: "watchOS 7.3.2", date: "March 8, 2021" },
                                        { name: "watchOS 7.3.3", date: "March 15, 2021" },
                                    ],
                                    className: "release-trio-tight" }
                            ]
                        },
                        "7-4": {
                            label: "watchOS 7.4",
                            releases: [
                                { name: "watchOS 7.4 beta 1", date: "February 1, 2021", alignment: "left" },
                                { name: "watchOS 7.4 beta 2", date: "February 16, 2021", alignment: "right" },
                                { name: "watchOS 7.4 beta 3", date: "March 4, 2021", alignment: "left" },
                                { name: "watchOS 7.4 beta 4", date: "March 15, 2021", alignment: "right" },
                                { name: "watchOS 7.4 beta 5", date: "March 23, 2021", alignment: "left" },
                                { name: "watchOS 7.4 beta 6", date: "March 31, 2021", alignment: "right" },
                                { name: "watchOS 7.4 beta 7", date: "April 7, 2021", spanTwo: true },
                                {
                                    pair: [
                                        { name: "watchOS 7.4 RC build", date: "April 20, 2021" },
                                        { name: "watchOS 7.4 final build", date: "April 26, 2021" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "watchOS 7.4.1", date: "May 3, 2021" }
                            ]
                        },
                        "7-5": {
                            label: "watchOS 7.5",
                            releases: [
                                { name: "watchOS 7.5 beta 1", date: "April 22, 2021", alignment: "left" },
                                { name: "watchOS 7.5 beta 2", date: "April 30, 2021", alignment: "right" },
                                { name: "watchOS 7.5 beta 3", date: "May 10, 2021", spanTwo: true },
                                {
                                    pair: [
                                        { name: "watchOS 7.5 RC build", date: "May 17, 2021" },
                                        { name: "watchOS 7.5 final build", date: "May 24, 2021" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "7-6": {
                            label: "watchOS 7.6",
                            releases: [
                                { name: "watchOS 7.6 beta 1", date: "May 19, 2021", alignment: "left" },
                                { name: "watchOS 7.6 beta 2", date: "June 2, 2021", alignment: "right" },
                                { name: "watchOS 7.6 beta 3", date: "June 14, 2021", alignment: "left" },
                                { name: "watchOS 7.6 beta 4", date: "June 29, 2021", alignment: "right" },
                                { name: "watchOS 7.6 beta 5", date: "July 8, 2021", spanTwo: true },
                                {
                                    pair: [
                                        { name: "watchOS 7.6 RC build", date: "July 13, 2021" },
                                        { name: "watchOS 7.6 final build", date: "July 19, 2021" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                {
                                    pair: [
                                        { name: "watchOS 7.6.1", date: "July 29, 2021" },
                                        { name: "watchOS 7.6.2", date: "September 13, 2021" },
                                    ],
                                    className: "release-pair-tight"
                                }
                            ]
                        },
                    };
            initializeTimelinePage(timelines);
        },
        "watchos-8.html": () => {
            const timelines = {
                        "8-0": {
                            label: "watchOS 8.0",
                            releases: [
                                { name: "watchOS 8.0 beta 1", date: "June 7, 2021", alignment: "left" },
                                { name: "watchOS 8.0 beta 2", date: "June 24, 2021", alignment: "right" },
                                { name: "watchOS 8.0 beta 3", date: "July 14, 2021", alignment: "left" },
                                { name: "watchOS 8.0 beta 4", date: "July 27, 2021", alignment: "right" },
                                { name: "watchOS 8.0 beta 5", date: "August 11, 2021", alignment: "left" },
                                { name: "watchOS 8.0 beta 6", date: "August 17, 2021", alignment: "right" },
                                { name: "watchOS 8.0 beta 7", date: "August 25, 2021", alignment: "left" },
                                { name: "watchOS 8.0 beta 8", date: "August 31, 2021", alignment: "right" },
                                {
                                    pair: [
                                        { name: "watchOS 8.0 RC build", date: "September 14, 2021" },
                                        { name: "watchOS 8.0 final build", date: "September 20, 2021" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "watchOS 8.0.1", date: "October 11, 2021" },
                            ]
                        },
                        "8-1": {
                            label: "watchOS 8.1",
                            releases: [
                                { name: "watchOS 8.1 beta 1", date: "September 21, 2021", alignment: "left" },
                                { name: "watchOS 8.1 beta 2", date: "September 28, 2021", alignment: "right" },
                                { name: "watchOS 8.1 beta 3", date: "October 6, 2021", alignment: "left" },
                                { name: "watchOS 8.1 beta 4", date: "October 13, 2021", alignment: "right" },
                                {
                                    pair: [
                                        { name: "iOS 15.1 RC build", date: "October 18, 2021" },
                                        { name: "iOS 15.1 final build", date: "October 25, 2021" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "watchOS 8.1.1", date: "November 18, 2021" }
                            ]
                        },
                        "8-3": {
                            label: "watchOS 8.3",
                            releases: [
                                { name: "watchOS 8.3 beta 1", date: "October 27, 2021", alignment: "left" },
                                { name: "watchOS 8.3 beta 2", date: "November 9, 2021", alignment: "right" },
                                { name: "watchOS 8.3 beta 3", date: "November 16, 2021", alignment: "left" },
                                { name: "watchOS 8.3 beta 4", date: "December 2, 2021", alignment: "right" },
                                {
                                    pair: [
                                        { name: "watchOS 8.3 RC build", date: "December 7, 2021" },
                                        { name: "watchOS 8.3 final build", date: "December 13, 2021" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "8-4": {
                            label: "watchOS 8.4",
                            releases: [
                                { name: "watchOS 8.4 beta 1", date: "December 17, 2021", alignment: "left" },
                                { name: "watchOS 8.4 beta 2", date: "January 12, 2022", alignment: "right" },
                                {
                                    pair: [
                                        { name: "watchOS 8.4 RC build", date: "January 20, 2022" },
                                        { name: "watchOS 8.4 final build", date: "January 26, 2022" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                {
                                    pair: [
                                        { name: "watchOS 8.4.1", date: "February 1, 2022" },
                                        { name: "watchOS 8.4.2", date: "February 10, 2022" },
                                    ]
                                }
                            ]
                        },
                        "8-5": {
                            label: "watchOS 8.5",
                            releases: [
                                { name: "watchOS 8.5 beta 1", date: "January 27, 2022", alignment: "left" },
                                { name: "watchOS 8.5 beta 2", date: "February 8, 2022", alignment: "right" },
                                { name: "watchOS 8.5 beta 3", date: "February 15, 2022", alignment: "left" },
                                { name: "watchOS 8.5 beta 4", date: "February 22, 2022", alignment: "right" },
                                { name: "watchOS 8.5 beta 5", date: "March 1, 2022", spanTwo: true },
                                {
                                    pair: [
                                        { name: "watchOS 8.5 RC build", date: "March 8, 2022" },
                                        { name: "watchOS 8.5 final build", date: "March 14, 2022" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "watchOS 8.5.1", date: "March 31, 2022" }
                            ]
                        },
                        "8-6": {
                            label: "watchOS 8.6",
                            releases: [
                                { name: "watchOS 8.6 beta 1", date: "April 5, 2022", alignment: "left" },
                                { name: "watchOS 8.6 beta 2", date: "April 19, 2022", alignment: "right" },
                                { name: "watchOS 8.6 beta 3", date: "April 26, 2022", alignment: "left" },
                                { name: "watchOS 8.6 beta 4", date: "May 3, 2022", alignment: "right" },
                                {
                                    pair: [
                                        { name: "watchOS 8.6 RC build", date: "May 12, 2022" },
                                        { name: "watchOS 8.6 final build", date: "May 16, 2022" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "8-7": {
                            label: "watchOS 8.7",
                            releases: [
                                { name: "watchOS 8.7 beta 1", date: "May 18, 2022", alignment: "left" },
                                { name: "watchOS 8.7 beta 2", date: "May 31, 2022", alignment: "right" },
                                { name: "watchOS 8.7 beta 3", date: "June 14, 2022", alignment: "left" },
                                { name: "watchOS 8.7 beta 4", date: "June 28, 2022", alignment: "right" },
                                { name: "watchOS 8.7 beta 5", date: "July 5, 2022", spanTwo: true },
                                {
                                    pair: [
                                        { name: "watchOS 8.7 RC build", date: "July 12, 2022" },
                                        { name: "watchOS 8.7 final build", date: "July 20, 2022" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "watchOS 8.7.1", date: "August 17, 2022" }
                            ]
                        },
                        "8-8-x": {
                            label: "watchOS 8.8.x",
                            releases: [
                                {
                                    pair: [
                                        { name: "watchOS 8.8.1", date: "June 21, 2023" },
                                        { name: "watchOS 8.8.2", date: "March 24, 2026" },
                                    ],
                                    className: "release-pair-tight"
                                }
                            ]
                        }
                    };
            initializeTimelinePage(timelines);
        },
        "watchos-9.html": () => {
            const timelines = {
                        "9-0": {
                            label: "watchOS 9.0",
                            releases: [
                                { name: "watchOS 9.0 beta 1", date: "June 6, 2022", alignment: "left" },
                                { name: "watchOS 9.0 beta 2", date: "June 22, 2022", alignment: "right" },
                                { name: "watchOS 9.0 beta 3", date: "July 6, 2022", alignment: "left" },
                                { name: "watchOS 9.0 beta 4", date: "July 28, 2022", alignment: "right" },
                                { name: "watchOS 9.0 beta 5", date: "August 8, 2022", alignment: "left" },
                                { name: "watchOS 9.0 beta 6", date: "August 15, 2022", alignment: "right" },
                                { name: "watchOS 9.0 beta 7", date: "August 23, 2022", spanTwo: true },
                                {
                                    pair: [
                                        { name: "watchOS 9.0 RC build", date: "September 7, 2022" },
                                        { name: "watchOS 9.0 final build", date: "September 12, 2022" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                {
                                    pair: [
                                        { name: "watchOS 9.0.1", date: "September 22, 2022" },
                                        { name: "watchOS 9.0.2", date: "October 10, 2022" }
                                    ],
                                    className: "release-pair-tight"
                                }
                            ]
                        },
                        "9-1": {
                            label: "watchOS 9.1",
                            releases: [
                                { name: "watchOS 9.1 beta 1", date: "September 14, 2022", alignment: "left" },
                                { name: "watchOS 9.1 beta 2", date: "September 20, 2022", alignment: "right" },
                                { name: "watchOS 9.1 beta 3", date: "September 27, 2022", alignment: "left" },
                                { name: "watchOS 9.1 beta 4", date: "October 4, 2022", alignment: "right" },
                                { name: "watchOS 9.1 beta 5", date: "October 12, 2022", spanTwo: true },
                                {
                                    pair: [
                                        { name: "watchOS 9.1 RC build", date: "October 18, 2022" },
                                        { name: "watchOS 9.1 final build", date: "October 24, 2022" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "9-2": {
                            label: "watchOS 9.2",
                            releases: [
                                { name: "watchOS 9.2 beta 1", date: "October 25, 2022", alignment: "left" },
                                { name: "watchOS 9.2 beta 2", date: "November 8, 2022", alignment: "right" },
                                { name: "watchOS 9.2 beta 3", date: "November 15, 2022", alignment: "left" },
                                { name: "watchOS 9.2 beta 4", date: "December 1, 2022", alignment: "right" },
                                {
                                    pair: [
                                        { name: "watchOS 9.2 RC build", date: "December 7, 2022" },
                                        { name: "watchOS 9.2 final build", date: "December 13, 2022" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "9-3": {
                            label: "watchOS 9.3",
                            releases: [
                                { name: "watchOS 9.3 beta 1", date: "December 14, 2022", alignment: "left" },
                                { name: "watchOS 9.3 beta 2", date: "January 10, 2023", alignment: "right" },
                                {
                                    pair: [
                                        { name: "watchOS 9.3 RC build", date: "January 18, 2023" },
                                        { name: "watchOS 9.3 final build", date: "January 23, 2023" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                { name: "watchOS 9.3.1", date: "February 13, 2023" }
                            ]
                        },
                        "9-4": {
                            label: "watchOS 9.4",
                            releases: [
                                { name: "watchOS 9.4 beta 1", date: "February 16, 2023", alignment: "left" },
                                { name: "watchOS 9.4 beta 2", date: "February 28, 2023", alignment: "right" },
                                { name: "watchOS 9.4 beta 3", date: "March 7, 2023", alignment: "left" },
                                { name: "watchOS 9.4 beta 4", date: "March 15, 2023", alignment: "right" },
                                {
                                    pair: [
                                        { name: "watchOS 9.4 RC build", date: "March 21, 2023" },
                                        { name: "watchOS 9.4 final build", date: "March 27, 2023" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                        },
                        "9-5": {
                            label: "watchOS 9.5",
                            releases: [
                                { name: "watchOS 9.5 beta 1", date: "March 28, 2023", alignment: "left" },
                                { name: "watchOS 9.5 beta 2", date: "April 11, 2023", alignment: "right" },
                                { name: "watchOS 9.5 beta 3", date: "April 25, 2023", alignment: "left" },
                                { name: "watchOS 9.5 beta 4", date: "May 2, 2023", alignment: "right" },
                                {
                                    pair: [
                                        { name: "watchOS 9.5 RC build", date: "May 9, 2023" },
                                        { name: "watchOS 9.5 final build", date: "May 18, 2023" }
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                {
                                    pair: [
                                        { name: "watchOS 9.5.1", date: "May 30, 2023" },
                                        { name: "watchOS 9.5.2", date: "June 21, 2023" },
                                    ],
                                    className: "release-pair-tight"
                                }
                            ]
                        },
                        "9-6": {
                            label: "watchOS 9.6",
                            releases: [
                                { name: "watchOS 9.6 beta 1", date: "May 19, 2023", alignment: "left" },
                                { name: "watchOS 9.6 beta 2", date: "May 31, 2023", alignment: "right" },
                                { name: "watchOS 9.6 beta 3", date: "June 15, 2023", alignment: "left" },
                                { name: "watchOS 9.6 beta 4", date: "June 27, 2023", alignment: "right" },
                                { name: "watchOS 9.6 beta 5", date: "July 10, 2023", spanTwo: true },
                                {
                                    pair: [
                                        { name: "watchOS 9.6 RC build", date: "July 18, 2023" },
                                        { name: "watchOS 9.6 final build", date: "July 24, 2023" },
                                    ],
                                    className: "release-pair-builds"
                                }
                            ],
                            supplemental: [
                                {
                                    quad: [
                                        { name: "watchOS 9.6.1", date: "August 15, 2023" },
                                        { name: "watchOS 9.6.2", date: "September 7, 2023" },
                                        { name: "watchOS 9.6.3", date: "September 21, 2023" },
                                        { name: "watchOS 9.6.4", date: "February 2, 2026" },
                                    ],
                                    className: "release-quad-tight"
                                }
                            ]
                        },
                    };
            initializeTimelinePage(timelines);
        }
    };

    const pathParts = window.location.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
    let pageName = pathParts[pathParts.length - 1] || "index";
    if (pageName === "apple-beta-timelines") pageName = "index";
    if (!pageName.endsWith(".html")) pageName += ".html";

    pageInitializers[pageName]?.();
})();
