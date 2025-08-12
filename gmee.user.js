// ==UserScript==
// @name         Google Maps Enhanced Edits
// @namespace    https://github.com/gncnpk/google-maps-enhanced-edits
// @version      0.0.13
// @description  Improves the edits section on Google Maps.
// @author       Gavin Canon-Phratsachack (https://github.com/gncnpk)
// @match        https://www.google.com/maps/contrib/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=google.com/maps
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
    .fontTitleLarge.HYVdIf:hover {
      text-decoration: underline;
    }
    /* Date filter disabled states */
    .quick-date-btn:disabled,
    .clear-date-btn:disabled {
      background: #e0e0e0 !important;
      color: #999 !important;
      cursor: not-allowed !important;
      border-color: #ccc !important;
    }
    input[type="date"]:disabled {
      background: #f5f5f5 !important;
      color: #999 !important;
      cursor: not-allowed !important;
    }
    /* Edit numbering styles */
    .edit-number {
      position: absolute;
      bottom: 8px;
      right: 8px;
      background: #4285f4;
      color: white;
      font-size: 12px;
      font-weight: bold;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      z-index: 10;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    }
    .edit-number.hidden {
      display: none !important;
    }
    .Jo6p1e {
      position: relative !important;
    }
  `;
    document.head.appendChild(style);

    // current filters
    let currentStatusFilter = null;
    let currentTypeFilter = null;
    let currentDateFilter = null; // Date object or null
    let currentDateRangeEnd = null; // Date object for range end or null
    let editsContainer  = null;

    // DOM & state
    let popup, btnContainer, typeContainer, dateContainer, statsDiv;
    let autoLoadEnabled = false;
    let numberingEnabled = true; // Track numbering toggle state
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

    // Helper function to parse date from edit text
    function parseEditDate(dateText) {
        if (!dateText) return null;
        
        const now = new Date();
        let editDate;
        
        // Handle "Submitted [Month] [Day]" format (e.g., "Submitted Aug 7")
        if (dateText.includes('Submitted')) {
            const submittedMatch = dateText.match(/Submitted\s+([A-Za-z]+)\s+(\d+)/i);
            if (submittedMatch) {
                const monthStr = submittedMatch[1];
                const day = parseInt(submittedMatch[2]);
                const currentYear = now.getFullYear();
                
                // Parse the month name to get month index
                const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                const fullMonthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                                      'July', 'August', 'September', 'October', 'November', 'December'];
                
                let monthIndex = monthNames.findIndex(m => monthStr.toLowerCase().startsWith(m.toLowerCase()));
                if (monthIndex === -1) {
                    monthIndex = fullMonthNames.findIndex(m => monthStr.toLowerCase() === m.toLowerCase());
                }
                
                if (monthIndex !== -1) {
                    editDate = new Date(currentYear, monthIndex, day);
                    
                    // If the date is in the future, assume it's from last year
                    if (editDate > now) {
                        editDate.setFullYear(currentYear - 1);
                    }
                }
            }
        }
        // Handle relative dates like "2 days ago", "1 week ago", etc.
        else if (dateText.includes('ago')) {
            const match = dateText.match(/(\d+)\s*(day|week|month|year)s?\s*ago/i);
            if (match) {
                const amount = parseInt(match[1]);
                const unit = match[2].toLowerCase();
                editDate = new Date(now);
                
                switch (unit) {
                    case 'day':
                        editDate.setDate(editDate.getDate() - amount);
                        break;
                    case 'week':
                        editDate.setDate(editDate.getDate() - (amount * 7));
                        break;
                    case 'month':
                        editDate.setMonth(editDate.getMonth() - amount);
                        break;
                    case 'year':
                        editDate.setFullYear(editDate.getFullYear() - amount);
                        break;
                }
            }
        } 
        // Handle "today", "yesterday" text
        else if (dateText.toLowerCase().includes('today')) {
            editDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        }
        else if (dateText.toLowerCase().includes('yesterday')) {
            editDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            editDate.setDate(editDate.getDate() - 1);
        }
        else {
            // Try to parse absolute dates
            editDate = new Date(dateText);
            if (isNaN(editDate.getTime())) {
                return null;
            }
        }
        
        return editDate && !isNaN(editDate.getTime()) ? editDate : null;
    }

    // Helper function to get date range of available edits
    function getEditDateRange() {
        if (!editsContainer) return { min: null, max: null, hasEdits: false };
        
        const editItems = Array.from(editsContainer.children);
        const dates = [];
        
        editItems.forEach(item => {
            // Skip items that are still loading
            if (isEditItemLoading(item)) return;
            
            const dateElement = item.querySelector('.fontBodySmall.eYfez');
            if (dateElement) {
                const dateText = dateElement.textContent.trim();
                const parsedDate = parseEditDate(dateText);
                if (parsedDate) {
                    dates.push(parsedDate);
                }
            }
        });
        
        if (dates.length === 0) {
            return { min: null, max: null, hasEdits: false };
        }
        
        const sortedDates = dates.sort((a, b) => a - b);
        return {
            min: sortedDates[0],
            max: sortedDates[sortedDates.length - 1],
            hasEdits: true
        };
    }

    // Helper function to update date input constraints
    function updateDateInputConstraints() {
        const startDateInput = dateContainer.querySelector('input[type="date"]:first-of-type');
        const endDateInput = dateContainer.querySelector('input[type="date"]:last-of-type');
        const quickDateButtons = dateContainer.querySelectorAll('.quick-date-btn');
        const clearBtn = dateContainer.querySelector('.clear-date-btn');
        
        if (!startDateInput || !endDateInput) return;
        
        const dateRange = getEditDateRange();
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        
        // Set max date to today for both inputs
        startDateInput.max = todayStr;
        endDateInput.max = todayStr;
        
        if (dateRange.hasEdits) {
            // Set min date to earliest edit date
            const minDateStr = dateRange.min.toISOString().split('T')[0];
            startDateInput.min = minDateStr;
            endDateInput.min = minDateStr;
            
            // Enable inputs and buttons
            startDateInput.disabled = false;
            endDateInput.disabled = false;
            quickDateButtons.forEach(btn => btn.disabled = false);
            clearBtn.disabled = currentDateFilter === null;
            
            // Update placeholder text
            startDateInput.title = `Select date between ${dateRange.min.toLocaleDateString()} and ${today.toLocaleDateString()}`;
            endDateInput.title = `Select date between ${dateRange.min.toLocaleDateString()} and ${today.toLocaleDateString()}`;
        } else {
            // Disable inputs and buttons when no edits are available
            startDateInput.disabled = true;
            endDateInput.disabled = true;
            startDateInput.value = '';
            endDateInput.value = '';
            quickDateButtons.forEach(btn => btn.disabled = true);
            clearBtn.disabled = true;
            
            // Update placeholder text
            startDateInput.title = 'No edits available for date filtering';
            endDateInput.title = 'No edits available for date filtering';
        }
    }

    // Helper function to check if an edit item is still loading
    function isEditItemLoading(item) {
        // Check for common indicators that content is still loading
        const dateElement = item.querySelector('.fontBodySmall.eYfez');
        const titleElement = item.querySelector('.fontTitleLarge.HYVdIf');
        const typeElement = item.querySelectorAll('.BjkJBb')[0]?.children[1];
        
        // If key elements are missing or empty, consider it still loading
        if (!dateElement || !titleElement || !typeElement) return true;
        if (!dateElement.textContent.trim() || !titleElement.textContent.trim() || !typeElement.textContent.trim()) return true;
        
        // Check for loading indicators or placeholder text
        const dateText = dateElement.textContent.trim();
        const titleText = titleElement.textContent.trim();
        
        if (dateText.includes('Loading') || titleText.includes('Loading') || 
            dateText === '...' || titleText === '...') return true;
        
        return false;
    }

    // Helper function to check if edit date is in selected range
    function isDateInRange(dateText) {
        if (!currentDateFilter) return true;
        
        // If date text is empty or not yet loaded, don't filter it out
        if (!dateText || dateText.trim() === '') return true;
        
        const editDate = parseEditDate(dateText);
        if (!editDate) return true; // Include items we can't parse or that haven't loaded yet
        
        const editDateOnly = new Date(editDate.getFullYear(), editDate.getMonth(), editDate.getDate());
        const filterDateOnly = new Date(currentDateFilter.getFullYear(), currentDateFilter.getMonth(), currentDateFilter.getDate());
        
        if (currentDateRangeEnd) {
            // Range filtering
            const endDateOnly = new Date(currentDateRangeEnd.getFullYear(), currentDateRangeEnd.getMonth(), currentDateRangeEnd.getDate());
            return editDateOnly >= filterDateOnly && editDateOnly <= endDateOnly;
        } else {
            // Single date filtering
            return editDateOnly.getTime() === filterDateOnly.getTime();
        }
    }

    // Add numbering to all edit items (moved to global scope)
    function addEditNumbering() {
        const PANE_SELECTOR = '.EhpEb';
        document.querySelectorAll(PANE_SELECTOR).forEach((item, index) => {
            const wrap = item.querySelector('.Jo6p1e');
            if (!wrap) return;
            
            // Remove existing number if present
            const existingNumber = wrap.querySelector('.edit-number');
            if (existingNumber) {
                existingNumber.remove();
            }
            
            // Add new number only if numbering is enabled
            if (numberingEnabled) {
                const numberElement = document.createElement('div');
                numberElement.className = 'edit-number';
                numberElement.textContent = index + 1;
                wrap.appendChild(numberElement);
            }
        });
    }

    // Automatically clean up .eYfez panes and symbol parents
    function setupAutoCleanup() {
        const CLEAN_SELECTOR = '.eYfez';
        const SYMBOL_SELECTOR = '.MaIKSd.google-symbols.G47vBd';
        const PANE_SELECTOR = '.EhpEb'
        const EDIT_NAME_SELECTOR = '.fontTitleLarge.HYVdIf'
        const observer = new MutationObserver(() => {
            cleanPanes();
            removeSymbolParents();
            replaceSpecificEdit();
            addColorStrip();
            addTooltipToEditName();
            addEditNumberingLocal();
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

        function addTooltipToEditName() {
            observer.disconnect();
            document.querySelectorAll(EDIT_NAME_SELECTOR).forEach(item => {
                item.title = "Go to map edit";
            });
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        }

        function addEditNumberingLocal() {
            observer.disconnect();
            addEditNumbering();
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
        addTooltipToEditName();
        addEditNumberingLocal();
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // Update edit numbering based on visible items
    function updateEditNumbering() {
        if (!editsContainer || !numberingEnabled) return;
        
        const allItems = Array.from(editsContainer.children);
        let visibleIndex = 1;
        
        allItems.forEach(item => {
            const wrap = item.querySelector('.Jo6p1e');
            const numberElement = wrap?.querySelector('.edit-number');
            
            if (getComputedStyle(item).display !== 'none') {
                // Item is visible, update number
                if (numberElement) {
                    numberElement.textContent = visibleIndex;
                    numberElement.style.display = '';
                }
                visibleIndex++;
            } else {
                // Item is hidden, hide number
                if (numberElement) {
                    numberElement.style.display = 'none';
                }
            }
        });
    }

    // Toggle edit numbering on/off
    function toggleEditNumbering() {
        numberingEnabled = !numberingEnabled;
        
        if (numberingEnabled) {
            // Show all existing numbers
            document.querySelectorAll('.edit-number').forEach(numberEl => {
                numberEl.classList.remove('hidden');
            });
            // Re-add numbering to any items that don't have numbers yet
            addEditNumbering();
            updateEditNumbering();
        } else {
            // Hide all numbers
            document.querySelectorAll('.edit-number').forEach(numberEl => {
                numberEl.classList.add('hidden');
            });
        }
        
        // Update toggle button text
        const toggleBtn = document.querySelector('.toggle-numbering-btn');
        if (toggleBtn) {
            toggleBtn.textContent = numberingEnabled ? 'Hide Numbers' : 'Show Numbers';
            toggleBtn.style.backgroundColor = numberingEnabled ? '#ea4335' : '#34a853';
        }
    }

    // --- filterEdits() ---
    function filterEdits() {
        const edits = document.getElementsByClassName('m6QErb XiKgde')[3];
        scrollContainer.scrollTop = 0;
        if (!edits) return;

        Array.from(edits.children).forEach(item => {
            let visible = true;

            // If the item is still loading, always keep it visible to avoid premature filtering
            if (isEditItemLoading(item)) {
                item.style.display = '';
                return;
            }

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

            // date filter
            if (visible && currentDateFilter) {
                const dateElement = item.querySelector('.fontBodySmall.eYfez');
                if (!dateElement) {
                    // If no date element exists yet, don't filter it out (content may still be loading)
                    visible = true;
                } else {
                    const dateText = dateElement.textContent.trim();
                    // If date text is empty or just whitespace, assume content is still loading
                    if (!dateText || dateText === '') {
                        visible = true;
                    } else {
                        if (!isDateInRange(dateText)) {
                            visible = false;
                        }
                    }
                }
            }

            item.style.display = visible ? '' : 'none';
        });
        
        // Update numbering after filtering
        updateEditNumbering();
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

  // Update date filter display
  updateDateFilterDisplay();

  // Update date input constraints based on available edits
  updateDateInputConstraints();

  // Update edit numbering
  updateEditNumbering();

  // auto-scroll if needed
  if (autoLoadEnabled && scrollContainer) {
    scrollContainer.scrollTop = scrollContainer.scrollHeight;
  }

  updateActiveButtons();
}

    // Update date filter display
    function updateDateFilterDisplay() {
        const dateStatus = dateContainer.querySelector('.date-status');
        if (dateStatus) {
            if (currentDateFilter) {
                const startDate = currentDateFilter.toLocaleDateString();
                if (currentDateRangeEnd) {
                    const endDate = currentDateRangeEnd.toLocaleDateString();
                    dateStatus.textContent = `Filtering: ${startDate} - ${endDate}`;
                } else {
                    dateStatus.textContent = `Filtering: ${startDate}`;
                }
                dateStatus.style.color = '#4285f4';
                dateStatus.style.fontWeight = 'bold';
            } else {
                dateStatus.textContent = 'No date filter active';
                dateStatus.style.color = '#666';
                dateStatus.style.fontWeight = 'normal';
            }
        }
    }

    // Clear date filter
    function clearDateFilter() {
        currentDateFilter = null;
        currentDateRangeEnd = null;
        filterEdits();
        updateButtonsAndStats();
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
            width: '280px'
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

        // date header + container
        const dateHeader = document.createElement('div');
        dateHeader.textContent = 'Filter edits by date:';
        dateHeader.style.margin = '8px 0 4px';
        popup.appendChild(dateHeader);

        dateContainer = document.createElement('div');
        
        // Date status display
        const dateStatus = document.createElement('div');
        dateStatus.className = 'date-status';
        dateStatus.textContent = 'No date filter active';
        dateStatus.style.cssText = `
            margin-bottom: 8px;
            font-size: 12px;
            color: #666;
        `;
        dateContainer.appendChild(dateStatus);

        // Date input container
        const dateInputContainer = document.createElement('div');
        dateInputContainer.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 4px;
            margin-bottom: 8px;
        `;

        // Start date input
        const startDateInput = document.createElement('input');
        startDateInput.type = 'date';
        startDateInput.style.cssText = `
            padding: 4px;
            border: 1px solid #ccc;
            border-radius: 4px;
            font-size: 12px;
        `;
        startDateInput.addEventListener('change', () => {
            if (startDateInput.value) {
                const selectedDate = new Date(startDateInput.value + 'T00:00:00');
                const today = new Date();
                today.setHours(23, 59, 59, 999); // End of today
                
                // Validate date is not in the future
                if (selectedDate > today) {
                    alert('Cannot select a future date');
                    startDateInput.value = '';
                    return;
                }
                
                // Validate date is within available edit range
                const dateRange = getEditDateRange();
                if (dateRange.hasEdits && (selectedDate < dateRange.min || selectedDate > dateRange.max)) {
                    alert(`Please select a date between ${dateRange.min.toLocaleDateString()} and ${dateRange.max.toLocaleDateString()}`);
                    startDateInput.value = '';
                    return;
                }
                
                currentDateFilter = selectedDate;
                // If end date is set and start > end, clear end date
                if (currentDateRangeEnd && currentDateFilter > currentDateRangeEnd) {
                    currentDateRangeEnd = null;
                    endDateInput.value = '';
                }
                filterEdits();
                updateButtonsAndStats();
            } else {
                currentDateFilter = null;
                currentDateRangeEnd = null;
                filterEdits();
                updateButtonsAndStats();
            }
        });

        // End date input (for range selection)
        const endDateInput = document.createElement('input');
        endDateInput.type = 'date';
        endDateInput.placeholder = 'End date (optional)';
        endDateInput.style.cssText = `
            padding: 4px;
            border: 1px solid #ccc;
            border-radius: 4px;
            font-size: 12px;
        `;
        endDateInput.addEventListener('change', () => {
            if (endDateInput.value) {
                const selectedDate = new Date(endDateInput.value + 'T23:59:59');
                const today = new Date();
                today.setHours(23, 59, 59, 999); // End of today
                
                // Validate date is not in the future
                if (selectedDate > today) {
                    alert('Cannot select a future date');
                    endDateInput.value = '';
                    return;
                }
                
                // Validate date is within available edit range
                const dateRange = getEditDateRange();
                if (dateRange.hasEdits && (selectedDate < dateRange.min || selectedDate > dateRange.max)) {
                    alert(`Please select a date between ${dateRange.min.toLocaleDateString()} and ${dateRange.max.toLocaleDateString()}`);
                    endDateInput.value = '';
                    return;
                }
                
                if (currentDateFilter && selectedDate >= currentDateFilter) {
                    currentDateRangeEnd = selectedDate;
                } else if (!currentDateFilter) {
                    // If no start date, set both to same date
                    currentDateFilter = new Date(endDateInput.value + 'T00:00:00');
                    currentDateRangeEnd = selectedDate;
                    startDateInput.value = endDateInput.value;
                } else {
                    // End date is before start date, swap them
                    currentDateRangeEnd = currentDateFilter;
                    currentDateFilter = new Date(endDateInput.value + 'T00:00:00');
                    startDateInput.value = endDateInput.value;
                }
                filterEdits();
                updateButtonsAndStats();
            } else {
                currentDateRangeEnd = null;
                filterEdits();
                updateButtonsAndStats();
            }
        });

        // Labels and inputs
        const startLabel = document.createElement('label');
        startLabel.textContent = 'Start date:';
        startLabel.style.fontSize = '12px';
        
        const endLabel = document.createElement('label');
        endLabel.textContent = 'End date (optional):';
        endLabel.style.fontSize = '12px';

        dateInputContainer.appendChild(startLabel);
        dateInputContainer.appendChild(startDateInput);
        dateInputContainer.appendChild(endLabel);
        dateInputContainer.appendChild(endDateInput);

        // Quick date buttons
        const quickDateContainer = document.createElement('div');
        quickDateContainer.style.cssText = `
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
            margin-bottom: 8px;
        `;

        const quickDates = [
            { name: 'Today', days: 0 },
            { name: 'Yesterday', days: 1 },
            { name: 'Last 7 days', days: 7 },
            { name: 'Last 30 days', days: 30 }
        ];

        quickDates.forEach(({ name, days }) => {
            const btn = document.createElement('button');
            btn.textContent = name;
            btn.className = 'quick-date-btn';
            btn.style.cssText = `
                background: #f0f0f0;
                border: 1px solid #ccc;
                border-radius: 4px;
                padding: 4px 8px;
                font-size: 11px;
                cursor: pointer;
                flex: 1;
            `;
            btn.addEventListener('click', () => {
                // Check if we have edits available
                const dateRange = getEditDateRange();
                if (!dateRange.hasEdits) {
                    alert('No edits available for date filtering');
                    return;
                }
                
                const now = new Date();
                if (days === 0) {
                    // Today only - check if we have edits for today
                    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                    if (today < dateRange.min || today > dateRange.max) {
                        alert('No edits available for today');
                        return;
                    }
                    currentDateFilter = today;
                    currentDateRangeEnd = null;
                    startDateInput.value = currentDateFilter.toISOString().split('T')[0];
                    endDateInput.value = '';
                } else {
                    // Range from X days ago to today
                    let startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1);
                    const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                    
                    // Adjust start date if it's before our earliest edit
                    if (startDate < dateRange.min) {
                        startDate = dateRange.min;
                    }
                    
                    // Check if the range contains any edits
                    if (startDate > dateRange.max) {
                        alert(`No edits available in the last ${days} days`);
                        return;
                    }
                    
                    currentDateFilter = startDate;
                    currentDateRangeEnd = endDate;
                    startDateInput.value = startDate.toISOString().split('T')[0];
                    endDateInput.value = endDate.toISOString().split('T')[0];
                }
                filterEdits();
                updateButtonsAndStats();
            });
            quickDateContainer.appendChild(btn);
        });

        // Clear button
        const clearBtn = document.createElement('button');
        clearBtn.textContent = 'Clear Filter';
        clearBtn.className = 'clear-date-btn';
        clearBtn.style.cssText = `
            background: #dc362e;
            border: none;
            border-radius: 4px;
            color: white;
            padding: 6px 12px;
            font-size: 12px;
            cursor: pointer;
            width: 100%;
        `;
        clearBtn.addEventListener('click', () => {
            startDateInput.value = '';
            endDateInput.value = '';
            clearDateFilter();
        });

        dateContainer.appendChild(dateInputContainer);
        dateContainer.appendChild(quickDateContainer);
        dateContainer.appendChild(clearBtn);
        popup.appendChild(dateContainer);

        // Edit numbering controls
        const numberingHeader = document.createElement('div');
        numberingHeader.textContent = 'Display options:';
        numberingHeader.style.margin = '8px 0 4px';
        popup.appendChild(numberingHeader);

        const numberingContainer = document.createElement('div');
        numberingContainer.style.marginBottom = '8px';

        const toggleBtn = document.createElement('button');
        toggleBtn.textContent = numberingEnabled ? 'Hide Numbers' : 'Show Numbers';
        toggleBtn.className = 'toggle-numbering-btn';
        toggleBtn.style.cssText = `
            background: ${numberingEnabled ? '#ea4335' : '#34a853'};
            border: none;
            border-radius: 4px;
            color: white;
            padding: 6px 12px;
            font-size: 12px;
            cursor: pointer;
            width: 100%;
        `;
        toggleBtn.addEventListener('click', toggleEditNumbering);

        numberingContainer.appendChild(toggleBtn);
        popup.appendChild(numberingContainer);

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
    if (currentStatusFilter || currentTypeFilter || currentDateFilter) {
      filterEdits();
    }
    new MutationObserver(() => {
      updateButtonsAndStats();
      if (currentStatusFilter || currentTypeFilter || currentDateFilter) {
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
