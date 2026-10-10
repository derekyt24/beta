/*(() => {
    const versionSelect = document.getElementById("software-version");
    const releaseGrid = document.getElementById("release-grid");
    const pickerLabel = versionSelect?.closest(".version-picker");

    if (!versionSelect || !releaseGrid || !pickerLabel || !versionSelect.options.length) return;

    const pickerRow = document.createElement("div");
    pickerRow.className = "version-picker-row";
    pickerLabel.parentNode.insertBefore(pickerRow, pickerLabel);
    pickerRow.appendChild(pickerLabel);

    const copyButton = document.createElement("button");
    copyButton.className = "version-link-copy";
    copyButton.type = "button";
    copyButton.setAttribute("aria-label", "Copy link to the selected version");
    copyButton.title = "Copy link to the selected version";
    copyButton.innerHTML = `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <rect x="9" y="9" width="12" height="12" rx="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
        <span class="version-link-copy-status" aria-live="polite"></span>
    `;
    pickerRow.appendChild(copyButton);

    const status = copyButton.querySelector(".version-link-copy-status");
    let resetStatusTimer;

    function currentVersionFromHash() {
        try {
            return decodeURIComponent(window.location.hash.slice(1));
        } catch {
            return "";
        }
    }

    function updateCopyLabel() {
        const selectedOption = versionSelect.selectedOptions[0];
        const versionName = selectedOption?.textContent.trim() || "selected version";
        const label = `Copy link to ${versionName}`;
        copyButton.setAttribute("aria-label", label);
        copyButton.title = label;
    }

    function updateAddressBar(method = "replaceState") {
        if (!versionSelect.value) return;
        const url = new URL(window.location.href);
        url.hash = versionSelect.value;
        if (url.href === window.location.href) return;
        window.history[method](window.history.state, "", url);
    }

    function selectVersionFromAddressBar() {
        const key = currentVersionFromHash();
        const hasMatchingOption = Array.from(versionSelect.options).some(option => option.value === key);
        const nextValue = hasMatchingOption ? key : versionSelect.options[0].value;

        if (versionSelect.value !== nextValue) {
            versionSelect.value = nextValue;
            versionSelect.dispatchEvent(new Event("change", { bubbles: true }));
        } else {
            updateCopyLabel();
        }

        updateAddressBar("replaceState");
    }

    function fallbackCopy(text) {
        const temporaryInput = document.createElement("textarea");
        temporaryInput.value = text;
        temporaryInput.setAttribute("readonly", "");
        temporaryInput.style.position = "fixed";
        temporaryInput.style.opacity = "0";
        document.body.appendChild(temporaryInput);
        temporaryInput.select();
        const copied = document.execCommand("copy");
        temporaryInput.remove();
        if (!copied) throw new Error("Copy command was unavailable");
    }

    async function copyText(text) {
        if (navigator.clipboard?.writeText) {
            try {
                await navigator.clipboard.writeText(text);
                return;
            } catch {
                fallbackCopy(text);
                return;
            }
        }

        fallbackCopy(text);
    }

    copyButton.addEventListener("click", async () => {
        updateAddressBar("replaceState");
        const link = new URL(window.location.href);
        link.hash = versionSelect.value;

        try {
            await copyText(link.href);
            status.textContent = "Link copied";
            copyButton.setAttribute("aria-label", "Link copied");
            copyButton.title = "Link copied";
        } catch {
            status.textContent = "Could not copy link";
            copyButton.setAttribute("aria-label", "Could not copy link");
            copyButton.title = "Could not copy link";
        }

        window.clearTimeout(resetStatusTimer);
        resetStatusTimer = window.setTimeout(updateCopyLabel, 1800);
    });

    versionSelect.addEventListener("change", () => {
        updateAddressBar("pushState");
        updateCopyLabel();
    });

    window.addEventListener("hashchange", selectVersionFromAddressBar);
    window.addEventListener("popstate", selectVersionFromAddressBar);

    selectVersionFromAddressBar();
})();*/