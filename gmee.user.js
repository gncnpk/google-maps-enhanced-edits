// ==UserScript==
// @name         Google Maps Enhanced Edits
// @namespace    https://github.com/gncnpk/google-maps-enhanced-edits
// @version      0.0.7
// @description  Improves the edits section on Google Maps.
// @author       Gavin Canon-Phratsachack (https://github.com/gncnpk)
// @match        https://www.google.com/maps/contrib/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=google.com
// @grant        none
// @run-at       document-start
// @license      MIT
// @downloadURL  https://update.greasyfork.org/scripts/543559/Google%20Maps%20Enhanced%20Edits.user.js
// @updateURL    https://update.greasyfork.org/scripts/543559/Google%20Maps%20Enhanced%20Edits.meta.js
// ==/UserScript==

(function() {
  'use strict';

  // current filters
  let currentStatusFilter = null;
  let currentTypeFilter   = null;

  // DOM & state
  let popup, btnContainer, typeContainer, statsDiv;
  let autoLoadEnabled = false;
  let scrollContainer = null;
  const shownStatuses = new Map();
  const shownTypes    = new Map();

// Replace your old STATUSES definition with this:
const STATUSES = [
  { name: 'Accepted',     className: 'cLk0Bb', color: '#198639' },
  { name: 'Pending',      className: 'UgJ9Rc', color: '#b26c00' },
  { name: 'Not Accepted', className: 'ehaAif', color: '#dc362e' }
];

// --- filterEdits() ---
function filterEdits() {
  const edits = document.getElementsByClassName('m6QErb XiKgde')[3];
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
      btn.style.outline = (name === currentStatusFilter)
        ? '2px solid blue'
        : 'none';
    });
    shownTypes.forEach((btn, type) => {
      btn.style.outline = (type === currentTypeFilter)
        ? '2px solid blue'
        : 'none';
    });
  }

  // make an element draggable by its header
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
    ['pointerup','pointercancel'].forEach(evt => {
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

  function updateButtonsAndStats(editsContainer) {
  // locate scroll container once
  if (!scrollContainer) {
    scrollContainer = getScrollContainer(editsContainer) ||
      document.querySelector('.m6QErb.DxyBCb.kA9KIf.dS8AEf.XiKgde');
  }

  // --- STATUS COUNTS by CSS class ---
  const sCounts = {};
  STATUSES.forEach(s => { sCounts[s.name] = 0; });

  Array.from(editsContainer.children).forEach(item => {
    STATUSES.forEach(s => {
      if (item.querySelector(`.${s.className}`)) {
        sCounts[s.name]++;
      }
    });
  });

  const total = Object.values(sCounts).reduce((a, b) => a + b, 0);
  statsDiv.textContent = `Total edits: ${total}`;

  // create / update / remove status buttons
  STATUSES.forEach(s => {
    const count   = sCounts[s.name] || 0;
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
        updateActiveButtons();
      });
      shownStatuses.set(s.name, btn);
      btnContainer.appendChild(btn);

    } else if (present && shownStatuses.has(s.name)) {
      // just update the count
      shownStatuses.get(s.name).textContent = `${s.name} (${count})`;

    } else if (!present && shownStatuses.has(s.name)) {
      // remove the button
      const btn = shownStatuses.get(s.name);
      btnContainer.removeChild(btn);
      shownStatuses.delete(s.name);
      if (currentStatusFilter === s.name) {
        currentStatusFilter = null;
        filterEdits();
      }
    }
  });

  // --- TYPE COUNTS (unchanged) ---
  const typeCounts = {};
  Array.from(editsContainer.children).forEach(item => {
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
        updateActiveButtons();
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
      }
    }
  });

  // auto-scroll if enabled
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
      updateButtonsAndStats(edits);
      if (currentStatusFilter || currentTypeFilter) {
        filterEdits();
      }
      new MutationObserver(() => {
        updateButtonsAndStats(edits);
        if (currentStatusFilter || currentTypeFilter) {
          filterEdits();
        }
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
