// ==UserScript==
// @name         Google Maps Enhanced Edits
// @namespace    https://github.com/gncnpk/google-maps-enhanced-edits
// @version      0.0.11
// @description  Improves the edits section on Google Maps.
// @author       Gavin Canon-Phratsachack (https://github.com/gncnpk)
// @match        https://www.google.com/maps/contrib/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=google.com
// @grant        none
// @run-at       document-start
// @license      MIT
// @downloadURL https://update.greasyfork.org/scripts/543559/Google%20Maps%20Enhanced%20Edits.user.js
// @updateURL https://update.greasyfork.org/scripts/543559/Google%20Maps%20Enhanced%20Edits.meta.js
// ==/UserScript==

(function() {
    'use strict';
    // inject a global CSS rule
    const style = document.createElement('style');
    style.textContent = `
    .qjoALb {
      margin-bottom: 0 !important;
    }
    .n6N0W {
      margin-bottom: 0 !important;
    }
    .zOQ8Le {
      margin-bottom: 4px !important;
    }
    .BjkJBb {
      margin: 6px !important;
    }
    .JjQyvd {
      margin: 0 8px 10px !important;
    }
    .mOLNZc {
      padding-top: 10px !important;
    }
    .Jo6p1e {
      padding: 10px !important;
    }
    .uLTO2d {
      margin: 8px !important;
    }
  `;
    document.head.appendChild(style);

    // current filters
    let currentStatusFilter = null;
    let currentTypeFilter = null;
    let editsContainer  = null;

    // DOM & state
    let popup, btnContainer, typeContainer, statsDiv;
    let autoLoadEnabled = false;
    let scrollContainer = null;
    const shownStatuses = new Map();
    const shownTypes = new Map();

    // Replace your old STATUSES definition with this:
    const STATUSES = [{
            name: 'Accepted',
            className: 'cLk0Bb',
            color: '#198639'
        },
        {
            name: 'Pending',
            className: 'UgJ9Rc',
            color: '#b26c00'
        },
        {
            name: 'Not Accepted',
            className: 'ehaAif',
            color: '#dc362e'
        }
    ];

    // Automatically clean up .eYfez panes and symbol parents
    function setupAutoCleanup() {
        const CLEAN_SELECTOR = '.eYfez';
        const SYMBOL_SELECTOR = '.MaIKSd.google-symbols.G47vBd';
        const PANE_SELECTOR = '.EhpEb'
        const observer = new MutationObserver(() => {
            cleanPanes();
            removeSymbolParents();
            replaceSpecificEdit();
            addColorStrip();
        });

        // remove first child of each .eYfez pane
        function cleanPanes() {
            document.querySelectorAll(CLEAN_SELECTOR).forEach(pane => {
                const first = pane.firstElementChild;
                if (first && pane.children.length >= 2) first.remove();
            });
        }

        // remove the parent of any matching symbol element
        function removeSymbolParents() {
            document.querySelectorAll(SYMBOL_SELECTOR).forEach(el => {
                const p = el.parentElement;
                if (p) {
                    p.remove();
                }
            });
        }

        function replaceSpecificEdit() {
            observer.disconnect();
            document.querySelectorAll(PANE_SELECTOR).forEach(item => {
                const mediumEl = item.querySelector(
                    '.fontBodyMedium.JjQyvd.TqOXoe'
                );
                const smallEl = item.querySelectorAll('.BjkJBb')[0]?.children[1];
                if (mediumEl && smallEl) {
                    const texts = Array.from(
                        mediumEl.querySelectorAll('.NlVald.xMSdlb')
                    ).map(el => el.textContent.trim());
                    smallEl.textContent = texts.join(', ');
                }
            });
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        }

        function addColorStrip() {
            observer.disconnect();
            document.querySelectorAll(PANE_SELECTOR).forEach(item => {
                const wrap = item.querySelector('.Jo6p1e');
                if (!wrap) return;
                // find which status this item has
                const statusObj = STATUSES.find(s => item.querySelector(`.${s.className}`));
                if (statusObj) {
                    wrap.style.borderLeft = `10px solid ${statusObj.color}`;
                    item.querySelector(`.${statusObj.className}`).style = "display: none !important;";
                } else {
                    // no status found → clear any old border
                    wrap.style.borderLeft = '';
                }
            });
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        }


        // initial pass
        cleanPanes();
        removeSymbolParents();
        replaceSpecificEdit();
        addColorStrip();
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // --- filterEdits() ---
    function filterEdits() {
        const edits = document.getElementsByClassName('m6QErb XiKgde')[3];
        scrollContainer.scrollTop = 0;
        if (!edits) return;

        Array.from(edits.children).forEach(item => {
            let visible = true;

            // status filter via CSS class
            if (currentStatusFilter) {
                const statusObj = STATUSES.find(s => s.name === currentStatusFilter);
                if (
                    !statusObj ||
                    !item.querySelector(`.${statusObj.className}`)
                ) {
                    visible = false;
                }
            }

            // type filter remains unchanged
            if (visible && currentTypeFilter) {
                const b = item.querySelectorAll('.BjkJBb')[0]?.children[1];
                if (!b) {
                    visible = false;
                } else {
                    const parts = b.textContent.split(',').map(p => p.trim());
                    if (!parts.includes(currentTypeFilter)) {
                        visible = false;
                    }
                }
            }

            item.style.display = visible ? '' : 'none';
        });
    }

    // outline the active filter buttons
    function updateActiveButtons() {
        shownStatuses.forEach((btn, name) => {
            btn.style.outline = (name === currentStatusFilter) ?
                '2px solid blue' :
                'none';
        });
        shownTypes.forEach((btn, type) => {
            btn.style.outline = (type === currentTypeFilter) ?
                '2px solid blue' :
                'none';
        });
    }

    // make an element draggable by its header
    function makeDraggable(el, handleSelector) {
        const handle = el.querySelector(handleSelector);
        if (!handle) return;
        handle.style.cursor = 'move';
        let offsetX = 0,
            offsetY = 0;

        handle.addEventListener('pointerdown', e => {
            const r = el.getBoundingClientRect();
            el.style.left = `${r.left}px`;
            el.style.top = `${r.top}px`;
            el.style.right = 'auto';
            el.style.transform = 'none';
            offsetX = e.clientX - r.left;
            offsetY = e.clientY - r.top;
            el.setPointerCapture(e.pointerId);
            e.preventDefault();
        });

        el.addEventListener('pointermove', e => {
            if (!el.hasPointerCapture(e.pointerId)) return;
            el.style.left = `${e.clientX - offsetX}px`;
            el.style.top = `${e.clientY - offsetY}px`;
        });
        ['pointerup', 'pointercancel'].forEach(evt => {
            el.addEventListener(evt, e => {
                if (el.hasPointerCapture(e.pointerId)) {
                    el.releasePointerCapture(e.pointerId);
                }
            });
        });
    }

    // find the nearest scrollable container
    function getScrollContainer(el) {
        let p = el;
        while (p && p !== document.body) {
            const style = getComputedStyle(p);
            if ((style.overflowY === 'auto' || style.overflowY === 'scroll') &&
                p.scrollHeight > p.clientHeight) {
                return p;
            }
            p = p.parentElement;
        }
        return null;
    }

    function updateButtonsAndStats() {
  // find scroll container once
  if (!scrollContainer) {
    scrollContainer =
      getScrollContainer(editsContainer) ||
      document.querySelector(
        '.m6QErb.DxyBCb.kA9KIf.dS8AEf.XiKgde'
      );
  }

  // grab only those items not hidden by filterEdits()
  const visibleItems = Array.from(editsContainer.children)
    .filter(item => getComputedStyle(item).display !== 'none');

  // --- STATUS COUNTS based on visibleItems ---
  const sCounts = {};
  STATUSES.forEach(s => { sCounts[s.name] = 0; });
  visibleItems.forEach(item => {
    STATUSES.forEach(s => {
      if (item.querySelector(`.${s.className}`)) {
        sCounts[s.name]++;
      }
    });
  });

  const total = Object.values(sCounts).reduce((a, b) => a + b, 0);
  statsDiv.textContent = `Total edits: ${total}`;

  // update/add/remove status buttons
  STATUSES.forEach(s => {
    const count = sCounts[s.name] || 0;
    const present = count > 0;

    if (present && !shownStatuses.has(s.name)) {
      const btn = document.createElement('button');
      btn.textContent = `${s.name} (${count})`;
      Object.assign(btn.style, {
        backgroundColor: s.color,
        border: 'none',
        borderRadius: '4px',
        color: '#000',
        padding: '6px 10px',
        margin: '0 4px 4px 0',
        cursor: 'pointer'
      });
      btn.addEventListener('click', () => {
        currentStatusFilter =
          currentStatusFilter === s.name ? null : s.name;
        filterEdits();
        updateButtonsAndStats();     // ← re-draw counts
      });
      shownStatuses.set(s.name, btn);
      btnContainer.appendChild(btn);

    } else if (present && shownStatuses.has(s.name)) {
      shownStatuses.get(s.name).textContent = `${s.name} (${count})`;

    } else if (!present && shownStatuses.has(s.name)) {
      const btn = shownStatuses.get(s.name);
      btnContainer.removeChild(btn);
      shownStatuses.delete(s.name);
      if (currentStatusFilter === s.name) {
        currentStatusFilter = null;
        filterEdits();
        updateButtonsAndStats();
      }
    }
  });

  // --- TYPE COUNTS based on visibleItems ---
  const typeCounts = {};
  visibleItems.forEach(item => {
    const b = item.querySelectorAll('.BjkJBb')[0]?.children[1];
    if (!b) return;
    b.textContent.split(',').forEach(part => {
      const txt = part.trim();
      if (!txt) return;
      typeCounts[txt] = (typeCounts[txt] || 0) + 1;
    });
  });
  Object.entries(typeCounts).forEach(([type, count]) => {
    const present = count > 0;
    if (present && !shownTypes.has(type)) {
      const btn = document.createElement('button');
      btn.textContent = `${type} (${count})`;
      Object.assign(btn.style, {
        backgroundColor: 'lightgray',
        border: 'none',
        borderRadius: '4px',
        color: '#000',
        padding: '6px 10px',
        margin: '0 4px 4px 0',
        cursor: 'pointer'
      });
      btn.addEventListener('click', () => {
        currentTypeFilter = currentTypeFilter === type ? null : type;
        filterEdits();
        updateButtonsAndStats();   // ← re-draw counts
      });
      shownTypes.set(type, btn);
      typeContainer.appendChild(btn);

    } else if (present && shownTypes.has(type)) {
      shownTypes.get(type).textContent = `${type} (${count})`;

    } else if (!present && shownTypes.has(type)) {
      const btn = shownTypes.get(type);
      typeContainer.removeChild(btn);
      shownTypes.delete(type);
      if (currentTypeFilter === type) {
        currentTypeFilter = null;
        filterEdits();
        updateButtonsAndStats();
      }
    }
  });

  // auto-scroll if needed
  if (autoLoadEnabled && scrollContainer) {
    scrollContainer.scrollTop = scrollContainer.scrollHeight;
  }

  updateActiveButtons();
}

    // build the floating popup
    function createPopup() {
        popup = document.createElement('div');
        Object.assign(popup.style, {
            position: 'fixed',
            top: '10px',
            right: '10px',
            backgroundColor: '#fff',
            border: '1px solid #ccc',
            borderRadius: '6px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            padding: '10px',
            zIndex: '9999',
            textAlign: 'left',
            width: '240px'
        });

        // header / drag handle
        const header = document.createElement('div');
        header.textContent = 'Filter edits by status:';
        header.classList.add('drag-handle');
        header.style.marginBottom = '8px';
        popup.appendChild(header);

        // stats
        statsDiv = document.createElement('div');
        statsDiv.textContent = 'Total edits: 0';
        statsDiv.style.marginBottom = '8px';
        popup.appendChild(statsDiv);

        // auto-load
        const autoLoadDiv = document.createElement('div');
        autoLoadDiv.style.marginBottom = '8px';
        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.id = 'gmee-auto-load';
        const lbl = document.createElement('label');
        lbl.htmlFor = 'gmee-auto-load';
        lbl.textContent = 'Auto load all edits';
        lbl.style.marginLeft = '4px';
        autoLoadDiv.appendChild(chk);
        autoLoadDiv.appendChild(lbl);
        popup.appendChild(autoLoadDiv);
        chk.addEventListener('change', () => {
            autoLoadEnabled = chk.checked;
            if (autoLoadEnabled && scrollContainer) {
                scrollContainer.scrollTop = scrollContainer.scrollHeight;
            }
        });

        // status buttons container
        btnContainer = document.createElement('div');
        popup.appendChild(btnContainer);

        // type header + container
        const typeHeader = document.createElement('div');
        typeHeader.textContent = 'Filter edits by type:';
        typeHeader.style.margin = '8px 0 4px';
        popup.appendChild(typeHeader);

        typeContainer = document.createElement('div');
        popup.appendChild(typeContainer);

        document.body.appendChild(popup);
        makeDraggable(popup, '.drag-handle');
    }

    // wait for the edits list to appear, then hook it
    function watchForContainer() {
  function trySetup() {
    const edits = document.getElementsByClassName('m6QErb XiKgde')[3];
    if (!edits) return false;
    editsContainer = edits;              // grab it here
    updateButtonsAndStats();
    if (currentStatusFilter || currentTypeFilter) {
      filterEdits();
    }
    new MutationObserver(() => {
      updateButtonsAndStats();
      if (currentStatusFilter || currentTypeFilter) {
        filterEdits();
      }
    }).observe(editsContainer, { childList: true });
    return true;
  }
  if (!trySetup()) {
    const bodyObs = new MutationObserver((_, obs) => {
      if (trySetup()) obs.disconnect();
    });
    bodyObs.observe(document.body, { childList: true, subtree: true });
  }
}

    function init() {
        createPopup();
        setupAutoCleanup();
        watchForContainer();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
