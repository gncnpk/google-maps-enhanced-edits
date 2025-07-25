// ==UserScript==
// @name         Google Maps Enhanced Edits
// @namespace    https://github.com/gncnpk/google-maps-enhanced-edits
// @version      0.0.2
// @description  Improves the edits section on Google Maps.
// @author       Gavin Canon-Phratsachack (https://github.com/gncnpk)
// @match        https://www.google.com/maps*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=google.com
// @grant        none
// @run-at       document-start
// @license      MIT
// ==/UserScript==

(function() {
  'use strict';

  let currentFilter    = null;
  let popup, btnContainer, statsDiv;
  let autoLoadEnabled  = false;
  let scrollContainer  = null;
  const shownStatuses  = new Map();
  const STATUSES       = [
    { name: 'Accepted',     color: 'green'  },
    { name: 'Pending',      color: 'yellow' },
    { name: 'Not Accepted', color: 'red'    }
  ];

  // 1) FILTER EDITS
  function filterEdits() {
    const edits = document.getElementsByClassName('m6QErb XiKgde')[3];
    if (!edits) return;
    const prefix = currentFilter
      ? (currentFilter.startsWith('Not') ? 'Not' : currentFilter.slice(0,3))
      : null;
    Array.from(edits.children).forEach(item => {
      const t = item.querySelector('.fontTitleSmall');
      if (!t) return;
      item.style.display = !prefix
        ? ''
        : (t.innerText.trim().startsWith(prefix) ? '' : 'none');
    });
  }

  // 2) DRAGGABLE POPUP (only header acts as handle)
  function makeDraggable(el, handleSelector) {
    const handle = el.querySelector(handleSelector);
    if (!handle) return;
    handle.style.cursor = 'move';
    let offsetX = 0, offsetY = 0;

    handle.addEventListener('pointerdown', e => {
      const r = el.getBoundingClientRect();
      el.style.left      = `${r.left}px`;
      el.style.top       = `${r.top}px`;
      el.style.right     = 'auto';
      el.style.transform = 'none';
      offsetX = e.clientX - r.left;
      offsetY = e.clientY - r.top;
      el.setPointerCapture(e.pointerId);
      e.preventDefault();
    });

    el.addEventListener('pointermove', e => {
      if (!el.hasPointerCapture(e.pointerId)) return;
      el.style.left = `${e.clientX - offsetX}px`;
      el.style.top  = `${e.clientY - offsetY}px`;
    });

    el.addEventListener('pointerup', e => {
      if (el.hasPointerCapture(e.pointerId)) {
        el.releasePointerCapture(e.pointerId);
      }
    });

    el.addEventListener('pointercancel', e => {
      if (el.hasPointerCapture(e.pointerId)) {
        el.releasePointerCapture(e.pointerId);
      }
    });
  }

  // 3) FIND THE SCROLLABLE CONTAINER
  function getScrollContainer(el) {
    let p = el;
    while (p && p !== document.body) {
      const style = getComputedStyle(p);
      if ((style.overflowY === 'auto' || style.overflowY === 'scroll')
          && p.scrollHeight > p.clientHeight) {
        return p;
      }
      p = p.parentElement;
    }
    return null;
  }

  // 4) UPDATE BUTTONS & STATS, AUTO-SCROLL IF ENABLED
  function updateButtonsAndStats(editsContainer) {
    // locate scroll container once
    if (!scrollContainer) {
      scrollContainer = getScrollContainer(editsContainer)
                     || document.querySelector(
                          '.m6QErb.DxyBCb.kA9KIf.dS8AEf.XiKgde'
                        );
    }

    // count prefixes
    const counts = { Acc: 0, Pen: 0, Not: 0 };
    Array.from(editsContainer.children).forEach(item => {
      const t = item.querySelector('.fontTitleSmall');
      if (!t) return;
      const txt = t.innerText.trim();
      const key = txt.startsWith('Not') ? 'Not' : txt.slice(0,3);
      if (counts.hasOwnProperty(key)) counts[key]++;
    });

    // update total
    const total = counts.Acc + counts.Pen + counts.Not;
    statsDiv.textContent = `Total edits: ${total}`;

    // update status buttons
    STATUSES.forEach(s => {
      const p      = s.name.startsWith('Not') ? 'Not' : s.name.slice(0,3);
      const count  = counts[p] || 0;
      const present= count > 0;

      if (present && !shownStatuses.has(s.name)) {
        // add button
        const btn = document.createElement('button');
        btn.textContent = `${s.name} (${count})`;
        Object.assign(btn.style, {
          backgroundColor: s.color,
          border: 'none',
          borderRadius: '4px',
          color: '#000',
          padding: '6px 10px',
          margin: '0 4px',
          cursor: 'pointer'
        });
        btn.addEventListener('click', () => {
          currentFilter = s.name;
          filterEdits();
        });
        shownStatuses.set(s.name, btn);
        btnContainer.appendChild(btn);

      } else if (present && shownStatuses.has(s.name)) {
        // update count
        shownStatuses.get(s.name).textContent = `${s.name} (${count})`;

      } else if (!present && shownStatuses.has(s.name)) {
        // remove button
        const btn = shownStatuses.get(s.name);
        btnContainer.removeChild(btn);
        shownStatuses.delete(s.name);
        if (currentFilter === s.name) {
          currentFilter = null;
          filterEdits();
        }
      }
    });

    // auto-scroll if checked
    if (autoLoadEnabled && scrollContainer) {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }
  }

  // 5) BUILD & SHOW POPUP
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
      textAlign: 'center'
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

    // auto-load checkbox
    const autoLoadDiv = document.createElement('div');
    autoLoadDiv.style.marginBottom = '8px';
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.id   = 'gmee-auto-load';
    const lbl = document.createElement('label');
    lbl.htmlFor     = 'gmee-auto-load';
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

    // button container
    btnContainer = document.createElement('div');
    popup.appendChild(btnContainer);

    document.body.appendChild(popup);
    makeDraggable(popup, '.drag-handle');
  }

  // 6) WAIT FOR EDITS CONTAINER & INSTALL OBSERVER
  function watchForContainer() {
    function trySetup() {
      const edits = document.getElementsByClassName('m6QErb XiKgde')[3];
      if (!edits) return false;
      updateButtonsAndStats(edits);
      if (currentFilter) filterEdits();
      new MutationObserver(() => {
        updateButtonsAndStats(edits);
        if (currentFilter) filterEdits();
      }).observe(edits, { childList: true });
      return true;
    }

    if (!trySetup()) {
      const bodyObs = new MutationObserver((_, obs) => {
        if (trySetup()) obs.disconnect();
      });
      bodyObs.observe(document.body, { childList: true, subtree: true });
    }
  }

  // 7) INIT
  function init() {
    createPopup();
    watchForContainer();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
