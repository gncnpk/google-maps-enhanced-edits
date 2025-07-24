// ==UserScript==
// @name         Google Maps Enhanced Edits
// @namespace    https://github.com/gncnpk/google-maps-enhanced-edits
// @version      0.0.1
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

  let currentFilter = null;
  let popup, btnContainer;
  const shownStatuses = new Map();
  const STATUSES = [
    { name: 'Accepted',     color: 'green'  },
    { name: 'Pending',      color: 'yellow' },
    { name: 'Not Accepted', color: 'red'    }
  ];

  // Show/hide items based on currentFilter
  function filterEdits() {
    const container = document.getElementsByClassName('m6QErb XiKgde')[3];
    if (!container) return;
    const prefix = currentFilter
      ? (currentFilter.startsWith('Not') ? 'Not' : currentFilter.slice(0, 3))
      : null;
    Array.from(container.children).forEach(item => {
      const t = item.querySelector('.fontTitleSmall');
      if (!t) return;
      item.style.display = !prefix
        ? ''
        : (t.innerText.trim().startsWith(prefix) ? '' : 'none');
    });
  }

  // Make the popup draggable via pointer events
  function makeDraggable(el) {
    let offsetX = 0, offsetY = 0;
    el.addEventListener('pointerdown', e => {
      if (e.target.closest('button')) return;
      const r = el.getBoundingClientRect();
      // snap to pixel and remove any transform/right positioning
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

  // Scan the container for which 3-letter prefixes exist, add/remove buttons
  function updateButtons(container) {
    const prefixes = new Set(
      Array.from(container.children)
        .map(item => {
          const t = item.querySelector('.fontTitleSmall');
          return t ? t.innerText.trim().substring(0, 3) : null;
        })
        .filter(Boolean)
    );
    STATUSES.forEach(s => {
      const p = s.name.startsWith('Not') ? 'Not' : s.name.slice(0, 3);
      const present = prefixes.has(p);
      if (present && !shownStatuses.has(s.name)) {
        const btn = document.createElement('button');
        btn.textContent = s.name;
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
      }
      if (!present && shownStatuses.has(s.name)) {
        const btn = shownStatuses.get(s.name);
        btnContainer.removeChild(btn);
        shownStatuses.delete(s.name);
        if (currentFilter === s.name) {
          currentFilter = null;
          filterEdits();
        }
      }
    });
  }

  // Build and inject the popup in the top-right
  function createPopup() {
    popup = document.createElement('div');
    Object.assign(popup.style, {
      position: 'fixed',
      top: '10px',
      right: '10px',
      transform: 'none',
      backgroundColor: '#fff',
      border: '1px solid #ccc',
      borderRadius: '6px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
      padding: '10px',
      zIndex: '9999',
      textAlign: 'center',
      cursor: 'move'
    });
    const header = document.createElement('div');
    header.textContent = 'Filter edits by status:';
    header.style.marginBottom = '8px';
    popup.appendChild(header);
    btnContainer = document.createElement('div');
    popup.appendChild(btnContainer);
    document.body.appendChild(popup);
    makeDraggable(popup);
  }

  // Watch for the 4th edits-container to appear, then wire up button updates
  function watchForContainer() {
    const trySetup = () => {
      const c = document.getElementsByClassName('m6QErb XiKgde')[3];
      if (c) {
        updateButtons(c);
        if (currentFilter) filterEdits();
        const mo = new MutationObserver(() => {
          updateButtons(c);
          if (currentFilter) filterEdits();
        });
        mo.observe(c, { childList: true });
        return true;
      }
      return false;
    };
    if (!trySetup()) {
      const bodyObs = new MutationObserver((_, obs) => {
        if (trySetup()) obs.disconnect();
      });
      bodyObs.observe(document.body, { childList: true, subtree: true });
    }
  }

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
