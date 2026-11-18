// "A new version is available" notice, shown in #updateBanner on the Visualizer and Admin pages.
// The server asks GitHub (serve.py /api/update-check, update_check.py); nothing is shown when it
// cannot tell or nothing newer exists. The notice follows the Visualizer's language setting.
(function () {
  "use strict";

  const STRINGS = {
    en: {
      label: "Update available",
      available: "A new version of the Catasto Visualizer is available:",
      youHave: "you have",
      macLink: "Download the new version for Mac",
      macSteps: "then quit the app's Terminal window, open the downloaded file, and drag Catasto Visualizer into Applications, choosing Replace.",
      otherSteps: "To update, follow \"Update the app\" in INSTALL.md.",
      whatsNew: "What's new in this version"
    },
    it: {
      label: "Aggiornamento disponibile",
      available: "È disponibile una nuova versione di Catasto Visualizer:",
      youHave: "hai la",
      macLink: "Scarica la nuova versione per Mac",
      macSteps: "poi chiudi la finestra del Terminale dell'app, apri il file scaricato e trascina Catasto Visualizer in Applicazioni, scegliendo Sostituisci.",
      otherSteps: "Per aggiornare, segui \"Update the app\" in INSTALL.md.",
      whatsNew: "Novità di questa versione"
    }
  };

  function language() {
    try {
      return localStorage.getItem("catasto-language") === "it" ? "it" : "en";
    } catch {
      return "en";
    }
  }

  function element(tag, text) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    return node;
  }

  function link(text, href) {
    const node = element("a", text);
    node.href = href;
    node.target = "_blank";
    node.rel = "noopener noreferrer";
    return node;
  }

  function show(container, data) {
    const text = STRINGS[language()];
    container.replaceChildren();
    container.setAttribute("aria-label", text.label);

    const first = element("p");
    first.append(element("strong", text.available), ` v${data.latest} (${text.youHave} v${data.current})`);
    container.append(first);

    const steps = element("p");
    if (data.platform === "mac") {
      steps.append(link(text.macLink, data.mac_download_url), ` ${text.macSteps}`);
    } else {
      steps.textContent = text.otherSteps;
    }
    container.append(steps);

    const last = element("p");
    last.append(link(text.whatsNew, data.release_url));
    container.append(last);
    container.hidden = false;
  }

  function check() {
    const container = document.getElementById("updateBanner");
    if (!container) return;
    fetch("/api/update-check", { cache: "no-store" })
      .then(response => (response.ok ? response.json() : null))
      .then(data => {
        if (data && data.update_available) show(container, data);
      })
      .catch(() => {});
  }

  check();
})();
