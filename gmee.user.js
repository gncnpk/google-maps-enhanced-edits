// ==UserScript==
// @name         Google Maps Enhanced Edits
// @namespace    https://github.com/gncnpk/google-maps-enhanced-edits
// @version      0.0.16
// @description  Adds quality of life tweaks to the editing experience in Google Maps.
// @author       Gavin Canon-Phratsachack (https://github.com/gncnpk)
// @match        https://www.google.com/maps/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=google.com/maps
// @grant        none
// @run-at       document-start
// @license      MIT
// @downloadURL https://update.greasyfork.org/scripts/543559/Google%20Maps%20Enhanced%20Edits.user.js
// @updateURL https://update.greasyfork.org/scripts/543559/Google%20Maps%20Enhanced%20Edits.meta.js
// ==/UserScript==

(function() {
    'use strict';

    // Constants
    const CONFIG = {
        STORAGE_KEY_NUMBERING: 'gmee-numbering-enabled',
        STORAGE_KEY_PERFORMANCE: 'gmee-performance-mode',
        MAX_RETRIES: 30,
        RETRY_DELAY: 1000,
        DEBOUNCE_DELAY: 100,
        HIGHLIGHT_DURATION: 3000
    };

    const SELECTORS = {
        EDIT_ITEM: '.EhpEb',
        EDIT_CONTAINER: '.m6QErb.XiKgde',
        EDIT_WRAP: '.qjoALb',
        DATE_ELEMENT: '.fontBodySmall.eYfez',
        TITLE_ELEMENT: '.fontTitleLarge.HYVdIf',
        STATUS_ELEMENTS: '.BjkJBb',
        CLEAN_SELECTOR: '.eYfez',
        SYMBOL_SELECTOR: '.MaIKSd.google-symbols.G47vBd',
        EDIT_NAME_SELECTOR: '.fontTitleLarge.HYVdIf'
    };

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
        },
        {
            name: 'Incorrect',
            className: 'gZbGnf',
            color: '#5e5e5e'
        }
    ];

    // Utility functions
    const debounce = (func, delay) => {
        let timeoutId;
        return (...args) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
    };

    const createElement = (tag, className, styles = {}, textContent = '') => {
        const element = document.createElement(tag);
        if (className) element.className = className;
        Object.assign(element.style, styles);
        if (textContent) element.textContent = textContent;
        return element;
    };

    // Enhanced Edits Manager
    class GoogleMapsEnhancedEdits {
        constructor() {
            this.state = {
                isInit: false,
                isEventHandlersInit: false,
                oldHref: document.location.href,
                numberingEnabled: localStorage.getItem(CONFIG.STORAGE_KEY_NUMBERING) !== 'false',
                performanceMode: localStorage.getItem(CONFIG.STORAGE_KEY_PERFORMANCE) === 'true',
                performanceModeBeforeAutoLoad: undefined,
                autoLoadEnabled: false,
                currentStatusFilter: null,
                currentTypeFilter: null,
                currentDateFilter: null,
                currentDateRangeEnd: null
            };

            this.elements = {
                popup: null,
                editsContainer: null,
                scrollContainer: null,
                statusList: null,
                typeList: null,
                dateContainer: null,
                statsDiv: null
            };

            this.observers = {
                main: null,
                container: null,
                autoCleanup: null
            };

            this.collections = {
                shownStatuses: new Map(),
                shownTypes: new Map()
            };

            this.debouncedUpdate = debounce(() => this.updateButtonsAndStats(), CONFIG.DEBOUNCE_DELAY);
            this.debouncedFilter = debounce(() => this.filterEdits(), CONFIG.DEBOUNCE_DELAY);
            this.debouncedNumbering = debounce(() => this.updateEditNumbering(), CONFIG.DEBOUNCE_DELAY);

            this.init();
        }

        init() {
            this.injectStyles();
            this.setupNavigationWatcher();
            this.checkInitState();
        }

        injectStyles() {
            // Always inject styles regardless of performance mode
            const styles = `
                /* Basic layout and spacing */
                .qjoALb { margin-bottom: 0 !important; }
                .n6N0W { margin-bottom: 0 !important; }
                .zOQ8Le { margin-bottom: 4px !important; }
                .BjkJBb { margin: 6px !important; }
                .JjQyvd { margin: 0 8px 10px !important; }
                .mOLNZc { padding-top: 10px !important; }
                .Jo6p1e { padding: 10px !important; position: relative !important; }
                .uLTO2d { margin: 8px !important; }
                .fontTitleLarge.HYVdIf:hover { text-decoration: underline; }
                .m6QErb.XiKgde.ecceSd.JoFlEe { width: auto !important; }
                .YWlkcf.fVTiyc { margin-top: auto !important; margin-bottom: auto !important; }
                .PInAKb { border-radius: 0% !important; margin-right: 5px !important; }

                /* CSS replacements for JS cleanup functions */

                /* Replace removeSymbolParents() - Hide Google symbols */
                .MaIKSd.google-symbols.G47vBd { display: none !important; }

                /* Replace cleanPanes() - Hide first child of date elements */
                .fontBodySmall.eYfez > *:first-child { display: none !important; }

                /* Replace addColorStrip() - Add colored borders based on status */
                .EhpEb:has(.cLk0Bb) .Jo6p1e { border-left: 10px solid #198639 !important; }
                .EhpEb:has(.UgJ9Rc) .Jo6p1e { border-left: 10px solid #b26c00 !important; }
                .EhpEb:has(.ehaAif) .Jo6p1e { border-left: 10px solid #dc362e !important; }
                .EhpEb:has(.gZbGnf) .Jo6p1e { border-left: 10px solid #5e5e5e !important; }

                /* Hide status indicators since we show them as colored borders */
                .cLk0Bb, .UgJ9Rc, .ehaAif, .gZbGnf { display: none !important; }

                /* Edit numbering styles */
                .edit-number {
                    position: relative; margin-top: auto; margin-bottom: auto; margin-right: 5px;
                    background: #4285f4; color: white; font-size: 12px; font-weight: bold;
                    width: 24px; height: 24px; border-radius: 0%; z-index: 10;
                    display: flex; align-items: center; justify-content: center;
                    min-width: 24px; box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                    transition: all 0.3s ease;
                }
                .edit-number.hidden { display: none !important; }
                .edit-number.highlight {
                    background: #ea4335 !important; transform: scale(1.2);
                    box-shadow: 0 0 15px rgba(234, 67, 53, 0.8);
                }

                /* Filter list styles */
                .filter-list {
                    max-height: 120px; overflow-y: auto; border: 1px solid #e0e0e0;
                    border-radius: 4px; margin-bottom: 8px; background: white;
                }
                .filter-list-item {
                    padding: 6px 8px; cursor: pointer; border-bottom: 1px solid #f0f0f0;
                    font-size: 12px; display: flex; justify-content: space-between;
                    align-items: center; transition: background-color 0.2s ease;
                }
                .filter-list-item:last-child { border-bottom: none; }
                .filter-list-item:hover { background-color: #f5f5f5; }
                .filter-list-item.active { background-color: #e3f2fd; border-left: 3px solid #2196f3; }
                .filter-list-item .status-indicator {
                    width: 12px; height: 12px; border-radius: 2px; margin-right: 6px;
                }
                .filter-list-item .count {
                    background: #e0e0e0; color: #666; padding: 2px 6px;
                    border-radius: 10px; font-size: 11px; min-width: 20px; text-align: center;
                }
                .filter-list-item.active .count { background: #2196f3; color: white; }
                .filter-list:empty { display: none; }

                /* Filter controls styles */
                .quick-date-btn:disabled, .clear-date-btn:disabled {
                    background: #e0e0e0 !important; color: #999 !important;
                    cursor: not-allowed !important; border-color: #ccc !important;
                }
                input[type="date"]:disabled {
                    background: #f5f5f5 !important; color: #999 !important; cursor: not-allowed !important;
                }

                .go-to-edit-container { display: flex; gap: 4px; align-items: center; margin-bottom: 8px; }
                .go-to-edit-input { flex: 1; padding: 4px 6px; border: 1px solid #ccc; border-radius: 4px; font-size: 12px; }
                .go-to-edit-btn {
                    background: #4285f4; border: none; border-radius: 4px; color: white;
                    padding: 4px 8px; font-size: 12px; cursor: pointer; white-space: nowrap;
                }
                .go-to-edit-btn:hover { background: #3367d6; }
                .go-to-edit-btn:disabled { background: #e0e0e0; color: #999; cursor: not-allowed; }
            `;

            const styleElement = createElement('style');
            styleElement.textContent = styles;
            document.head.appendChild(styleElement);
        }

        setupNavigationWatcher() {
            this.observers.main = new MutationObserver(() => {
                if (this.state.oldHref !== document.location.href) {
                    this.state.oldHref = document.location.href;
                    this.checkInitState();
                }
            });

            this.observers.main.observe(document.body, {
                childList: true,
                subtree: true
            });
        }

        checkInitState() {
            const isEditsPage = window.location.href.includes("/contrib/") &&
                !window.location.href.includes("/photos/") &&
                !window.location.href.includes("/answers/") &&
                !window.location.href.includes("/reviews/") &&
                !window.location.href.includes("/contribute/");

            if (isEditsPage && !this.state.isInit) {
                this.initializeEditsUI();
            } else if (!isEditsPage && this.state.isInit) {
                this.deinitializeEditsUI();
            }

            if (!this.state.isEventHandlersInit) {
                this.state.isEventHandlersInit = true;
                this.waitForElementAndClick("okDpye PpaGLb", 1);
            }
        }

        initializeEditsUI() {
            console.log('Initializing Google Maps Enhanced Edits UI');
            this.state.isInit = true;
            this.createPopup();

            // Setup auto cleanup (JS functions) only if not in performance mode
            if (!this.state.performanceMode) {
                this.setupAutoCleanup();
            } else {
                console.log('Performance mode enabled - skipping JS cleanup functions (CSS styles remain active)');
            }

            this.watchForContainer();
        }

        deinitializeEditsUI() {
            console.log('Deinitializing Google Maps Enhanced Edits UI');

            if (this.elements.popup?.parentNode) {
                this.elements.popup.parentNode.removeChild(this.elements.popup);
            }

            Object.values(this.observers).forEach(observer => {
                if (observer) {
                    observer.disconnect();
                }
            });

            Object.assign(this.state, {
                isInit: false,
                currentStatusFilter: null,
                currentTypeFilter: null,
                currentDateFilter: null,
                currentDateRangeEnd: null
            });

            this.collections.shownStatuses.clear();
            this.collections.shownTypes.clear();

            Object.keys(this.elements).forEach(key => {
                this.elements[key] = null;
            });

            this.cleanupModifications();
        }

        cleanupModifications() {
            // Only cleanup JS-generated elements, not CSS-styled ones
            document.querySelectorAll('.edit-number').forEach(el => el.remove());
        }

        togglePerformanceMode() {
            this.state.performanceMode = !this.state.performanceMode;
            localStorage.setItem(CONFIG.STORAGE_KEY_PERFORMANCE, this.state.performanceMode.toString());

            if (this.state.performanceMode) {
                console.log('Enabling performance mode - stopping JS cleanup functions (CSS styles remain active)');

                // Disconnect JS cleanup observer
                if (this.observers.autoCleanup) {
                    this.observers.autoCleanup.disconnect();
                    this.observers.autoCleanup = null;
                }

                // Remove JS-generated elements only
                this.cleanupModifications();

                // Disable numbering in performance mode since it requires JS
                if (this.state.numberingEnabled) {
                    this.state.numberingEnabled = false;
                    localStorage.setItem(CONFIG.STORAGE_KEY_NUMBERING, 'false');

                    const numberingBtn = document.querySelector('.toggle-numbering-btn');
                    if (numberingBtn) {
                        numberingBtn.textContent = 'Show Numbers';
                        numberingBtn.style.backgroundColor = '#34a853';
                        numberingBtn.disabled = true;
                        numberingBtn.title = 'Disabled in performance mode';
                    }
                }

            } else {
                console.log('Disabling performance mode - enabling JS cleanup functions');

                // Re-enable JS cleanup functions
                this.setupAutoCleanup();

                const numberingBtn = document.querySelector('.toggle-numbering-btn');
                if (numberingBtn) {
                    numberingBtn.disabled = false;
                    numberingBtn.title = '';
                }
            }

            const performanceBtn = document.querySelector('.toggle-performance-btn');
            if (performanceBtn) {
                performanceBtn.textContent = this.state.performanceMode ? 'Disable Performance Mode' : 'Enable Performance Mode';
                performanceBtn.style.backgroundColor = this.state.performanceMode ? '#34a853' : '#ea4335';
            }
        }

        findEditsContainer() {
            const editItems = document.querySelectorAll(SELECTORS.EDIT_ITEM);
            if (editItems.length > 0) {
                let container = editItems[0].parentElement;
                while (container && container.children.length < editItems.length) {
                    container = container.parentElement;
                }
                if (container && container.children.length >= editItems.length) {
                    return container;
                }
            }

            const containers = Array.from(document.querySelectorAll(SELECTORS.EDIT_CONTAINER))
                .filter(el => {
                    const parent = el.parentElement;
                    return parent && Array.from(parent.children).filter(child =>
                        child.classList.contains('m6QErb') && child.classList.contains('XiKgde')
                    ).length > 1;
                });

            if (containers.length > 0) {
                return containers.reduce((best, container) => {
                    const editCount = container.querySelectorAll(`${SELECTORS.EDIT_ITEM}, .Jo6p1e`).length;
                    const bestCount = best ? best.querySelectorAll(`${SELECTORS.EDIT_ITEM}, .Jo6p1e`).length : 0;
                    return editCount > bestCount ? container : best;
                }, null);
            }

            return null;
        }

        findScrollContainer() {
            if (this.elements.editsContainer) {
                let container = this.elements.editsContainer;
                while (container && container !== document.body) {
                    const style = getComputedStyle(container);
                    if ((style.overflowY === 'auto' || style.overflowY === 'scroll') &&
                        container.scrollHeight > container.clientHeight) {
                        return container;
                    }
                    container = container.parentElement;
                }
            }

            const selectors = [
                '.m6QErb.DxyBCb.kA9KIf.dS8AEf.XiKgde',
                '.CsJaGe',
                '.siAUzd.Vetdqc',
                '[role="main"]'
            ];

            for (const selector of selectors) {
                const container = document.querySelector(selector);
                if (container) {
                    const style = getComputedStyle(container);
                    if ((style.overflowY === 'auto' || style.overflowY === 'scroll') &&
                        container.scrollHeight > container.clientHeight) {
                        return container;
                    }
                }
            }

            return null;
        }

        watchForContainer() {
            let retryCount = 0;

            const trySetup = () => {
                console.log(`Finding edits container (attempt ${retryCount + 1}/${CONFIG.MAX_RETRIES})`);

                const editsContainer = this.findEditsContainer();
                if (!editsContainer) {
                    retryCount++;
                    if (retryCount < CONFIG.MAX_RETRIES) {
                        setTimeout(trySetup, CONFIG.RETRY_DELAY);
                    }
                    return false;
                }

                this.elements.editsContainer = editsContainer;
                this.elements.scrollContainer = this.findScrollContainer();

                this.updateButtonsAndStats();
                if (this.hasActiveFilters()) {
                    this.filterEdits();
                }

                this.observers.container = new MutationObserver(this.debouncedUpdate);
                this.observers.container.observe(editsContainer, {
                    childList: true
                });

                return true;
            };

            trySetup();
        }

        hasActiveFilters() {
            return this.state.currentStatusFilter ||
                this.state.currentTypeFilter ||
                this.state.currentDateFilter;
        }

        createPopup() {
            this.elements.popup = createElement('div', '', {
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

            this.elements.statsDiv = createElement('div', 'drag-handle', {
                marginBottom: '8px'
            }, 'Total edits: 0');

            this.elements.popup.appendChild(this.elements.statsDiv);

            this.createFilterSections();
            this.createControlSections();

            document.body.appendChild(this.elements.popup);
            this.makeDraggable(this.elements.popup, '.drag-handle');
        }

        createFilterSections() {
            this.elements.popup.appendChild(createElement('div', '', {
                marginBottom: '4px',
                fontSize: '12px',
                fontWeight: 'bold'
            }, 'Filter by status:'));
            this.elements.statusList = createElement('div', 'filter-list');
            this.elements.popup.appendChild(this.elements.statusList);

            this.elements.popup.appendChild(createElement('div', '', {
                marginBottom: '4px',
                fontSize: '12px',
                fontWeight: 'bold'
            }, 'Filter by type:'));
            this.elements.typeList = createElement('div', 'filter-list');
            this.elements.popup.appendChild(this.elements.typeList);

            this.elements.popup.appendChild(createElement('div', '', {
                margin: '8px 0 4px',
                fontSize: '12px',
                fontWeight: 'bold'
            }, 'Filter by date:'));
            this.elements.dateContainer = createElement('div');
            this.createDateControls();
            this.elements.popup.appendChild(this.elements.dateContainer);
        }

        createDateControls() {
            const dateStatus = createElement('div', 'date-status', {
                marginBottom: '8px',
                fontSize: '12px',
                color: '#666'
            }, 'No date filter active');
            this.elements.dateContainer.appendChild(dateStatus);

            const dateInputContainer = createElement('div', '', {
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                marginBottom: '8px'
            });

            const startLabel = createElement('label', '', {
                fontSize: '12px'
            }, 'Start date:');
            const startDateInput = createElement('input', '', {
                padding: '4px',
                border: '1px solid #ccc',
                borderRadius: '4px',
                fontSize: '12px'
            });
            startDateInput.type = 'date';

            const endLabel = createElement('label', '', {
                fontSize: '12px'
            }, 'End date (optional):');
            const endDateInput = createElement('input', '', {
                padding: '4px',
                border: '1px solid #ccc',
                borderRadius: '4px',
                fontSize: '12px'
            });
            endDateInput.type = 'date';

            startDateInput.addEventListener('change', () => this.handleStartDateChange(startDateInput, endDateInput));
            endDateInput.addEventListener('change', () => this.handleEndDateChange(startDateInput, endDateInput));

            dateInputContainer.appendChild(startLabel);
            dateInputContainer.appendChild(startDateInput);
            dateInputContainer.appendChild(endLabel);
            dateInputContainer.appendChild(endDateInput);

            const quickDateContainer = createElement('div', '', {
                display: 'flex',
                flexWrap: 'wrap',
                gap: '4px',
                marginBottom: '8px'
            });

            const quickDates = [{
                    name: 'Today',
                    days: 0
                },
                {
                    name: 'Yesterday',
                    days: 1
                },
                {
                    name: 'Last 7 days',
                    days: 7
                },
                {
                    name: 'Last 30 days',
                    days: 30
                }
            ];

            quickDates.forEach(({
                name,
                days
            }) => {
                const btn = createElement('button', 'quick-date-btn', {
                    background: '#f0f0f0',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                    padding: '4px 8px',
                    fontSize: '11px',
                    cursor: 'pointer',
                    flex: '1'
                }, name);

                btn.addEventListener('click', () => this.handleQuickDate(days, startDateInput, endDateInput));
                quickDateContainer.appendChild(btn);
            });

            const clearBtn = createElement('button', 'clear-date-btn', {
                background: '#dc362e',
                border: 'none',
                borderRadius: '4px',
                color: 'white',
                padding: '6px 12px',
                fontSize: '12px',
                cursor: 'pointer',
                width: '100%'
            }, 'Clear Filter');

            clearBtn.addEventListener('click', () => this.clearDateFilter(startDateInput, endDateInput));

            this.elements.dateContainer.appendChild(dateInputContainer);
            this.elements.dateContainer.appendChild(quickDateContainer);
            this.elements.dateContainer.appendChild(clearBtn);
        }

        handleStartDateChange(startInput, endInput) {
            if (startInput.value) {
                const selectedDate = new Date(startInput.value + 'T00:00:00');
                const today = new Date();
                today.setHours(23, 59, 59, 999);

                if (selectedDate > today) {
                    alert('Cannot select a future date');
                    startInput.value = '';
                    return;
                }

                const dateRange = this.getEditDateRange();
                if (dateRange.hasEdits && (selectedDate < dateRange.min || selectedDate > dateRange.max)) {
                    alert(`Please select a date between ${dateRange.min.toLocaleDateString()} and ${dateRange.max.toLocaleDateString()}`);
                    startInput.value = '';
                    return;
                }

                this.state.currentDateFilter = selectedDate;
                if (this.state.currentDateRangeEnd && this.state.currentDateFilter > this.state.currentDateRangeEnd) {
                    this.state.currentDateRangeEnd = null;
                    endInput.value = '';
                }
                this.filterEdits();
                this.updateButtonsAndStats();
            } else {
                this.state.currentDateFilter = null;
                this.state.currentDateRangeEnd = null;
                this.filterEdits();
                this.updateButtonsAndStats();
            }
        }

        handleEndDateChange(startInput, endInput) {
            if (endInput.value) {
                const selectedDate = new Date(endInput.value + 'T23:59:59');
                const today = new Date();
                today.setHours(23, 59, 59, 999);

                if (selectedDate > today) {
                    alert('Cannot select a future date');
                    endInput.value = '';
                    return;
                }

                const dateRange = this.getEditDateRange();
                if (dateRange.hasEdits && (selectedDate < dateRange.min || selectedDate > dateRange.max)) {
                    alert(`Please select a date between ${dateRange.min.toLocaleDateString()} and ${dateRange.max.toLocaleDateRange()}`);
                    endInput.value = '';
                    return;
                }

                if (this.state.currentDateFilter && selectedDate >= this.state.currentDateFilter) {
                    this.state.currentDateRangeEnd = selectedDate;
                } else if (!this.state.currentDateFilter) {
                    this.state.currentDateFilter = new Date(endInput.value + 'T00:00:00');
                    this.state.currentDateRangeEnd = selectedDate;
                    startInput.value = endInput.value;
                } else {
                    this.state.currentDateRangeEnd = this.state.currentDateFilter;
                    this.state.currentDateFilter = new Date(endInput.value + 'T00:00:00');
                    startInput.value = endInput.value;
                }
                this.filterEdits();
                this.updateButtonsAndStats();
            } else {
                this.state.currentDateRangeEnd = null;
                this.filterEdits();
                this.updateButtonsAndStats();
            }
        }

        handleQuickDate(days, startInput, endInput) {
            const dateRange = this.getEditDateRange();
            if (!dateRange.hasEdits) {
                alert('No edits available for date filtering');
                return;
            }

            const now = new Date();
            if (days === 0) {
                const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                if (today < dateRange.min || today > dateRange.max) {
                    alert('No edits available for today');
                    return;
                }
                this.state.currentDateFilter = today;
                this.state.currentDateRangeEnd = null;
                startInput.value = this.state.currentDateFilter.toISOString().split('T')[0];
                endInput.value = '';
            } else {
                let startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1);
                const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

                if (startDate < dateRange.min) {
                    startDate = dateRange.min;
                }

                if (startDate > dateRange.max) {
                    alert(`No edits available in the last ${days} days`);
                    return;
                }

                this.state.currentDateFilter = startDate;
                this.state.currentDateRangeEnd = endDate;
                startInput.value = startDate.toISOString().split('T')[0];
                endInput.value = endDate.toISOString().split('T')[0];
            }
            this.filterEdits();
            this.updateButtonsAndStats();
        }

        clearDateFilter(startInput, endInput) {
            startInput.value = '';
            endInput.value = '';
            this.state.currentDateFilter = null;
            this.state.currentDateRangeEnd = null;
            this.filterEdits();
            this.updateButtonsAndStats();
        }

        getEditDateRange() {
            if (!this.elements.editsContainer) return {
                min: null,
                max: null,
                hasEdits: false
            };

            const editItems = Array.from(this.elements.editsContainer.children);
            const dates = [];

            editItems.forEach(item => {
                if (this.isEditItemLoading(item)) return;

                const dateElement = item.querySelector(SELECTORS.DATE_ELEMENT);
                if (dateElement) {
                    const dateText = dateElement.textContent.trim();
                    const parsedDate = this.parseEditDate(dateText);
                    if (parsedDate) {
                        dates.push(parsedDate);
                    }
                }
            });

            if (dates.length === 0) {
                return {
                    min: null,
                    max: null,
                    hasEdits: false
                };
            }

            const sortedDates = dates.sort((a, b) => a - b);
            return {
                min: sortedDates[0],
                max: sortedDates[sortedDates.length - 1],
                hasEdits: true
            };
        }

        createControlSections() {
            const goToHeader = createElement('div', '', {
                margin: '8px 0 4px',
                fontSize: '12px',
                fontWeight: 'bold'
            }, 'Go to edit number:');
            this.elements.popup.appendChild(goToHeader);

            const goToContainer = createElement('div', 'go-to-edit-container');
            const goToInput = createElement('input', 'go-to-edit-input', {}, '');
            goToInput.type = 'number';
            goToInput.placeholder = 'Edit #';
            goToInput.min = 1;

            const goToBtn = createElement('button', 'go-to-edit-btn', {}, 'Go');

            goToInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && goToInput.value) {
                    this.goToEditNumber(parseInt(goToInput.value));
                    goToInput.value = '';
                }
            });

            goToBtn.addEventListener('click', () => {
                if (goToInput.value) {
                    this.goToEditNumber(parseInt(goToInput.value));
                    goToInput.value = '';
                }
            });

            goToContainer.appendChild(goToInput);
            goToContainer.appendChild(goToBtn);
            this.elements.popup.appendChild(goToContainer);

            const optionsHeader = createElement('div', '', {
                margin: '8px 0 4px',
                fontSize: '12px',
                fontWeight: 'bold'
            }, 'Options:');
            this.elements.popup.appendChild(optionsHeader);

            const optionsContainer = createElement('div', '', {
                marginBottom: '8px'
            });

            const performanceBtn = createElement('button', 'toggle-performance-btn', {
                background: this.state.performanceMode ? '#34a853' : '#ea4335',
                border: 'none',
                borderRadius: '4px',
                color: 'white',
                padding: '6px 12px',
                fontSize: '12px',
                cursor: 'pointer',
                width: '100%',
                marginBottom: '8px'
            }, this.state.performanceMode ? 'Disable Performance Mode' : 'Enable Performance Mode');

            performanceBtn.addEventListener('click', () => this.togglePerformanceMode());
            optionsContainer.appendChild(performanceBtn);

            const autoLoadBtn = createElement('button', 'toggle-autoload-btn', {
                background: this.state.autoLoadEnabled ? '#ea4335' : '#34a853',
                border: 'none',
                borderRadius: '4px',
                color: 'white',
                padding: '6px 12px',
                fontSize: '12px',
                cursor: 'pointer',
                width: '100%',
                marginBottom: '8px'
            }, this.state.autoLoadEnabled ? 'Disable Auto Load' : 'Enable Auto Load');

            autoLoadBtn.addEventListener('click', () => this.toggleAutoLoad());
            optionsContainer.appendChild(autoLoadBtn);

            const toggleBtn = createElement('button', 'toggle-numbering-btn', {
                background: this.state.numberingEnabled ? '#ea4335' : '#34a853',
                border: 'none',
                borderRadius: '4px',
                color: 'white',
                padding: '6px 12px',
                fontSize: '12px',
                cursor: 'pointer',
                width: '100%'
            }, this.state.numberingEnabled ? 'Hide Numbers' : 'Show Numbers');

            if (this.state.performanceMode) {
                toggleBtn.disabled = true;
                toggleBtn.title = 'Disabled in performance mode';
                toggleBtn.style.backgroundColor = '#ccc';
            }

            toggleBtn.addEventListener('click', () => this.toggleEditNumbering());
            optionsContainer.appendChild(toggleBtn);

            this.elements.popup.appendChild(optionsContainer);
        }

        toggleAutoLoad() {
            this.state.autoLoadEnabled = !this.state.autoLoadEnabled;

            if (this.state.autoLoadEnabled) {
                this.state.performanceModeBeforeAutoLoad = this.state.performanceMode;

                if (!this.state.performanceMode) {
                    this.togglePerformanceMode();
                }

                if (this.elements.scrollContainer) {
                    this.elements.scrollContainer.scrollTop = this.elements.scrollContainer.scrollHeight;
                }
            } else {
                if (this.state.performanceMode && !this.state.performanceModeBeforeAutoLoad) {
                    this.togglePerformanceMode();
                }

                this.state.performanceModeBeforeAutoLoad = undefined;

                // Immediately refresh the display when auto-load is disabled
                this.updateButtonsAndStats();
                if (this.hasActiveFilters()) {
                    this.filterEdits();
                }
            }

            const autoLoadBtn = document.querySelector('.toggle-autoload-btn');
            if (autoLoadBtn) {
                autoLoadBtn.textContent = this.state.autoLoadEnabled ? 'Disable Auto Load' : 'Enable Auto Load';
                autoLoadBtn.style.backgroundColor = this.state.autoLoadEnabled ? '#ea4335' : '#34a853';
            }
        }

        setupAutoCleanup() {
            // Only setup JS cleanup functions if not in performance mode
            if (this.state.performanceMode) {
                return;
            }

            this.observers.autoCleanup = new MutationObserver(() => {
                // Only JS functions that cannot be replaced with CSS
                this.replaceSpecificEdit(); // Modifies text content - needs JS
                this.addTooltipToEditName(); // Adds title attribute - needs JS
                this.addEditNumbering(); // Adds DOM elements - needs JS
            });

            this.observers.autoCleanup.observe(document.body, {
                childList: true,
                subtree: true
            });
        }

        replaceSpecificEdit() {
            if (this.state.performanceMode) return;

            this.observers.autoCleanup?.disconnect();

            document.querySelectorAll(SELECTORS.EDIT_ITEM).forEach(item => {
                const mediumEl = item.querySelector('.fontBodyMedium.JjQyvd.TqOXoe');
                const smallEl = item.querySelectorAll('.BjkJBb')[0]?.children[1];

                if (mediumEl && smallEl) {
                    const texts = Array.from(mediumEl.querySelectorAll('.NlVald.xMSdlb'))
                        .map(el => el.textContent.trim());
                    smallEl.textContent = texts.join(', ');
                }
            });

            if (this.observers.autoCleanup) {
                this.observers.autoCleanup.observe(document.body, {
                    childList: true,
                    subtree: true
                });
            }
        }

        addTooltipToEditName() {
            if (this.state.performanceMode) return;

            document.querySelectorAll(SELECTORS.EDIT_NAME_SELECTOR)
                .forEach(item => item.title = "Go to map edit");
        }

        addEditNumbering() {
            if (this.state.performanceMode || !this.state.numberingEnabled) return;

            document.querySelectorAll(SELECTORS.EDIT_ITEM).forEach((item, index) => {
                const wrap = item.querySelector(SELECTORS.EDIT_WRAP);
                if (!wrap) return;

                let numberElement = wrap.querySelector('.edit-number');
                if (!numberElement) {
                    numberElement = createElement('div', 'edit-number', {}, (index + 1).toString());
                    wrap.insertBefore(numberElement, wrap.children[0]);
                } else {
                    numberElement.textContent = (index + 1).toString();
                }
            });
        }

        updateEditNumbering() {
            if (this.state.performanceMode || !this.elements.editsContainer || !this.state.numberingEnabled) return;

            const allItems = Array.from(this.elements.editsContainer.children);
            let visibleIndex = 1;

            allItems.forEach(item => {
                const numberElement = item.querySelector('.edit-number');
                const isVisible = getComputedStyle(item).display !== 'none';

                if (numberElement) {
                    if (isVisible) {
                        numberElement.textContent = visibleIndex;
                        numberElement.style.display = '';
                        visibleIndex++;
                    } else {
                        numberElement.style.display = 'none';
                    }
                }
            });
        }

        toggleEditNumbering() {
            if (this.state.performanceMode) {
                alert('Edit numbering is disabled in performance mode to prevent browser lag.');
                return;
            }

            this.state.numberingEnabled = !this.state.numberingEnabled;
            localStorage.setItem(CONFIG.STORAGE_KEY_NUMBERING, this.state.numberingEnabled.toString());

            const numberElements = document.querySelectorAll('.edit-number');
            if (this.state.numberingEnabled) {
                numberElements.forEach(el => el.classList.remove('hidden'));
                this.addEditNumbering();
                this.updateEditNumbering();
            } else {
                numberElements.forEach(el => el.classList.add('hidden'));
            }

            const toggleBtn = document.querySelector('.toggle-numbering-btn');
            if (toggleBtn) {
                toggleBtn.textContent = this.state.numberingEnabled ? 'Hide Numbers' : 'Show Numbers';
                toggleBtn.style.backgroundColor = this.state.numberingEnabled ? '#ea4335' : '#34a853';
            }
        }

        goToEditNumber(targetNumber) {
            if (this.state.performanceMode) {
                if (!this.elements.editsContainer) {
                    alert('Edits container not found');
                    return;
                }

                const visibleItems = Array.from(this.elements.editsContainer.children)
                    .filter(item => getComputedStyle(item).display !== 'none');

                if (targetNumber < 1 || targetNumber > visibleItems.length) {
                    alert(`Please enter a number between 1 and ${visibleItems.length}`);
                    return;
                }

                const targetItem = visibleItems[targetNumber - 1];
                this.scrollToItem(targetItem);
                return;
            }

            if (!this.elements.editsContainer || !this.state.numberingEnabled) {
                alert('Edit numbering must be enabled to use this feature');
                return;
            }

            const visibleItems = Array.from(this.elements.editsContainer.children)
                .filter(item => getComputedStyle(item).display !== 'none');

            if (targetNumber < 1 || targetNumber > visibleItems.length) {
                alert(`Please enter a number between 1 and ${visibleItems.length}`);
                return;
            }

            const targetItem = visibleItems[targetNumber - 1];
            const numberElement = targetItem.querySelector('.edit-number');

            if (numberElement) {
                document.querySelectorAll('.edit-number.highlight')
                    .forEach(el => el.classList.remove('highlight'));

                numberElement.classList.add('highlight');
                setTimeout(() => numberElement.classList.remove('highlight'), CONFIG.HIGHLIGHT_DURATION);
            }

            this.scrollToItem(targetItem);
        }

        scrollToItem(item) {
            if (this.elements.scrollContainer) {
                const containerRect = this.elements.scrollContainer.getBoundingClientRect();
                const itemRect = item.getBoundingClientRect();
                const scrollTop = this.elements.scrollContainer.scrollTop +
                    itemRect.top - containerRect.top - (containerRect.height / 2) + (itemRect.height / 2);

                this.elements.scrollContainer.scrollTo({
                    top: scrollTop,
                    behavior: 'smooth'
                });
            } else {
                item.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center'
                });
            }
        }

        filterEdits() {
            if (!this.elements.editsContainer) return;

            if (this.elements.scrollContainer) {
                this.elements.scrollContainer.scrollTop = 0;
            }

            Array.from(this.elements.editsContainer.children).forEach(item => {
                const isVisible = this.isItemVisible(item);
                item.style.display = isVisible ? '' : 'none';
            });

            this.debouncedNumbering();
        }

        isItemVisible(item) {
            if (this.isEditItemLoading(item)) return true;

            if (this.state.currentStatusFilter) {
                const statusObj = STATUSES.find(s => s.name === this.state.currentStatusFilter);
                if (!statusObj || !item.querySelector(`.${statusObj.className}`)) {
                    return false;
                }
            }

            if (this.state.currentTypeFilter) {
                const typeElement = item.querySelectorAll('.BjkJBb')[0]?.children[1];
                if (!typeElement) return false;

                const types = typeElement.textContent.split(',').map(t => t.trim());
                if (!types.includes(this.state.currentTypeFilter)) {
                    return false;
                }
            }

            if (this.state.currentDateFilter) {
                const dateElement = item.querySelector(SELECTORS.DATE_ELEMENT);
                if (!dateElement) return true;

                const dateText = dateElement.textContent.trim();
                if (!dateText) return true;

                if (!this.isDateInRange(dateText)) {
                    return false;
                }
            }

            return true;
        }

        isEditItemLoading(item) {
            const dateElement = item.querySelector(SELECTORS.DATE_ELEMENT);
            const titleElement = item.querySelector(SELECTORS.TITLE_ELEMENT);
            const typeElement = item.querySelectorAll('.BjkJBb')[0]?.children[1];

            return !dateElement || !titleElement || !typeElement ||
                !dateElement.textContent.trim() || !titleElement.textContent.trim() ||
                !typeElement.textContent.trim();
        }

        isDateInRange(dateText) {
            if (!this.state.currentDateFilter || !dateText.trim()) return true;

            const editDate = this.parseEditDate(dateText);
            if (!editDate) return true;

            const editDateOnly = new Date(editDate.getFullYear(), editDate.getMonth(), editDate.getDate());
            const filterDateOnly = new Date(this.state.currentDateFilter.getFullYear(),
                this.state.currentDateFilter.getMonth(), this.state.currentDateFilter.getDate());

            if (this.state.currentDateRangeEnd) {
                const endDateOnly = new Date(this.state.currentDateRangeEnd.getFullYear(),
                    this.state.currentDateRangeEnd.getMonth(), this.state.currentDateRangeEnd.getDate());
                return editDateOnly >= filterDateOnly && editDateOnly <= endDateOnly;
            }

            return editDateOnly.getTime() === filterDateOnly.getTime();
        }

        parseEditDate(dateText) {
            if (!dateText) return null;

            const now = new Date();

            const submittedMatch = dateText.match(/Submitted\s+([A-Za-z]+)\s+(\d+)/i);
            if (submittedMatch) {
                const monthStr = submittedMatch[1];
                const day = parseInt(submittedMatch[2]);
                const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
                ];

                const monthIndex = monthNames.findIndex(m =>
                    monthStr.toLowerCase().startsWith(m.toLowerCase()));

                if (monthIndex !== -1) {
                    const editDate = new Date(now.getFullYear(), monthIndex, day);
                    return editDate > now ? new Date(now.getFullYear() - 1, monthIndex, day) : editDate;
                }
            }

            const relativeMatch = dateText.match(/(\d+)\s*(day|week|month|year)s?\s*ago/i);
            if (relativeMatch) {
                const amount = parseInt(relativeMatch[1]);
                const unit = relativeMatch[2].toLowerCase();
                const editDate = new Date(now);

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
                return editDate;
            }

            if (dateText.toLowerCase().includes('today')) {
                return new Date(now.getFullYear(), now.getMonth(), now.getDate());
            }
            if (dateText.toLowerCase().includes('yesterday')) {
                const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                yesterday.setDate(yesterday.getDate() - 1);
                return yesterday;
            }

            const parsedDate = new Date(dateText);
            return !isNaN(parsedDate.getTime()) ? parsedDate : null;
        }

        updateButtonsAndStats() {
            if (!this.elements.editsContainer) return;

            // Skip expensive operations during auto load for better performance
            if (this.state.autoLoadEnabled) {
                // Show message that calculations are paused
                this.elements.statsDiv.textContent = 'Auto-load active - calculations paused for performance';
                this.elements.statsDiv.style.color = '#ff9800';
                this.elements.statsDiv.style.fontWeight = 'bold';

                // Clear filter lists and show placeholder messages
                this.showAutoLoadPlaceholders();

                if (this.elements.scrollContainer) {
                    this.elements.scrollContainer.scrollTop = this.elements.scrollContainer.scrollHeight;
                }
                return;
            }

            // Reset stats styling when not in auto-load mode
            this.elements.statsDiv.style.color = '';
            this.elements.statsDiv.style.fontWeight = '';

            if (!this.elements.scrollContainer) {
                this.elements.scrollContainer = this.findScrollContainer();
            }

            const visibleItems = Array.from(this.elements.editsContainer.children)
                .filter(item => getComputedStyle(item).display !== 'none');

            this.updateStatusList(visibleItems);
            this.updateTypeList(visibleItems);
            this.updateStats(visibleItems);
            this.updateDateFilterDisplay();
            this.updateGoToEditConstraints();
        }
        showAutoLoadPlaceholders() {
            // Clear existing filter lists
            this.collections.shownStatuses.clear();
            this.collections.shownTypes.clear();
            this.elements.statusList.innerHTML = '';
            this.elements.typeList.innerHTML = '';

            // Add placeholder messages
            const statusPlaceholder = createElement('div', '', {
                padding: '8px',
                textAlign: 'center',
                color: '#666',
                fontStyle: 'italic',
                fontSize: '11px'
            }, 'Filters paused during auto-load');

            const typePlaceholder = createElement('div', '', {
                padding: '8px',
                textAlign: 'center',
                color: '#666',
                fontStyle: 'italic',
                fontSize: '11px'
            }, 'Filters paused during auto-load');

            this.elements.statusList.appendChild(statusPlaceholder);
            this.elements.typeList.appendChild(typePlaceholder);
        }

        updateStatusList(visibleItems) {
            const statusCounts = {};
            STATUSES.forEach(status => {
                statusCounts[status.name] = visibleItems.filter(item =>
                    item.querySelector(`.${status.className}`)
                ).length;
            });

            STATUSES.forEach(status => {
                const count = statusCounts[status.name];
                const hasCount = count > 0;

                if (hasCount && !this.collections.shownStatuses.has(status.name)) {
                    this.createStatusListItem(status, count);
                } else if (hasCount && this.collections.shownStatuses.has(status.name)) {
                    const countElement = this.collections.shownStatuses.get(status.name).querySelector('.count');
                    if (countElement) countElement.textContent = count;
                } else if (!hasCount && this.collections.shownStatuses.has(status.name)) {
                    this.removeStatusListItem(status.name);
                }
            });
        }

        createStatusListItem(status, count) {
            const item = createElement('div', 'filter-list-item');
            if (this.state.currentStatusFilter === status.name) {
                item.classList.add('active');
            }

            const content = createElement('div', '', {
                display: 'flex',
                alignItems: 'center',
                flex: '1'
            });

            const indicator = createElement('div', 'status-indicator', {
                backgroundColor: status.color
            });

            const name = createElement('span', '', {}, status.name);
            const countElement = createElement('span', 'count', {}, count.toString());

            content.appendChild(indicator);
            content.appendChild(name);
            item.appendChild(content);
            item.appendChild(countElement);

            item.addEventListener('click', () => {
                this.state.currentStatusFilter =
                    this.state.currentStatusFilter === status.name ? null : status.name;

                // Update active state
                this.collections.shownStatuses.forEach(listItem => {
                    listItem.classList.remove('active');
                });
                if (this.state.currentStatusFilter === status.name) {
                    item.classList.add('active');
                }

                this.debouncedFilter();
                this.debouncedUpdate();
            });

            this.collections.shownStatuses.set(status.name, item);
            this.elements.statusList.appendChild(item);
        }

        removeStatusListItem(statusName) {
            const item = this.collections.shownStatuses.get(statusName);
            if (item && item.parentNode) {
                item.parentNode.removeChild(item);
            }
            this.collections.shownStatuses.delete(statusName);

            if (this.state.currentStatusFilter === statusName) {
                this.state.currentStatusFilter = null;
                this.debouncedFilter();
                this.debouncedUpdate();
            }
        }

        updateTypeList(visibleItems) {
            const typeCounts = {};

            visibleItems.forEach(item => {
                const typeElement = item.querySelectorAll('.BjkJBb')[0]?.children[1];
                if (!typeElement) return;

                typeElement.textContent.split(',').forEach(part => {
                    const type = part.trim();
                    if (type) typeCounts[type] = (typeCounts[type] || 0) + 1;
                });
            });

            // Update existing items
            Object.entries(typeCounts).forEach(([type, count]) => {
                if (!this.collections.shownTypes.has(type)) {
                    this.createTypeListItem(type, count);
                } else {
                    const countElement = this.collections.shownTypes.get(type).querySelector('.count');
                    if (countElement) countElement.textContent = count.toString();
                }
            });

            // Remove items that no longer exist
            for (const [type, item] of this.collections.shownTypes.entries()) {
                if (!typeCounts[type]) {
                    this.removeTypeListItem(type);
                }
            }
        }

        createTypeListItem(type, count) {
            const item = createElement('div', 'filter-list-item');
            if (this.state.currentTypeFilter === type) {
                item.classList.add('active');
            }

            const name = createElement('span', '', {}, type);
            const countElement = createElement('span', 'count', {}, count.toString());

            item.appendChild(name);
            item.appendChild(countElement);

            item.addEventListener('click', () => {
                this.state.currentTypeFilter =
                    this.state.currentTypeFilter === type ? null : type;

                // Update active state
                this.collections.shownTypes.forEach(listItem => {
                    listItem.classList.remove('active');
                });
                if (this.state.currentTypeFilter === type) {
                    item.classList.add('active');
                }

                this.debouncedFilter();
                this.debouncedUpdate();
            });

            this.collections.shownTypes.set(type, item);
            this.elements.typeList.appendChild(item);
        }

        removeTypeListItem(type) {
            const item = this.collections.shownTypes.get(type);
            if (item && item.parentNode) {
                item.parentNode.removeChild(item);
            }
            this.collections.shownTypes.delete(type);

            if (this.state.currentTypeFilter === type) {
                this.state.currentTypeFilter = null;
                this.debouncedFilter();
                this.debouncedUpdate();
            }
        }

        updateStats(visibleItems) {
            const total = visibleItems.length;
            this.elements.statsDiv.textContent = `Total edits: ${total}`;
        }

        updateDateFilterDisplay() {
            const dateStatus = this.elements.dateContainer.querySelector('.date-status');
            if (dateStatus) {
                if (this.state.currentDateFilter) {
                    const startDate = this.state.currentDateFilter.toLocaleDateString();
                    if (this.state.currentDateRangeEnd) {
                        const endDate = this.state.currentDateRangeEnd.toLocaleDateString();
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

        updateGoToEditConstraints() {
            const goToInput = this.elements.popup?.querySelector('.go-to-edit-input');
            const goToBtn = this.elements.popup?.querySelector('.go-to-edit-btn');

            if (!goToInput || !goToBtn || !this.elements.editsContainer) return;

            const visibleItems = Array.from(this.elements.editsContainer.children).filter(item =>
                getComputedStyle(item).display !== 'none'
            );

            const maxNumber = visibleItems.length;

            if (maxNumber === 0) {
                goToInput.disabled = true;
                goToBtn.disabled = true;
                goToInput.placeholder = 'No edits available';
                goToInput.title = 'No edits available to navigate to';
            } else {
                goToInput.disabled = false;
                goToBtn.disabled = false;
                goToInput.placeholder = `1-${maxNumber}`;
                goToInput.title = `Enter edit number between 1 and ${maxNumber}`;
                goToInput.max = maxNumber;
                goToInput.min = 1;
            }
        }

        makeDraggable(element, handleSelector) {
            const handle = element.querySelector(handleSelector);
            if (!handle) return;

            handle.style.cursor = 'move';
            let offsetX = 0,
                offsetY = 0;

            handle.addEventListener('pointerdown', (e) => {
                const rect = element.getBoundingClientRect();
                element.style.cssText += `left: ${rect.left}px; top: ${rect.top}px; right: auto; transform: none;`;
                offsetX = e.clientX - rect.left;
                offsetY = e.clientY - rect.top;
                element.setPointerCapture(e.pointerId);
                e.preventDefault();
            });

            element.addEventListener('pointermove', (e) => {
                if (element.hasPointerCapture(e.pointerId)) {
                    element.style.left = `${e.clientX - offsetX}px`;
                    element.style.top = `${e.clientY - offsetY}px`;
                }
            });

            ['pointerup', 'pointercancel'].forEach(eventType => {
                element.addEventListener(eventType, (e) => {
                    if (element.hasPointerCapture(e.pointerId)) {
                        element.releasePointerCapture(e.pointerId);
                    }
                });
            });
        }

        waitForElementAndClick(className, index = 0) {
            const checkForElement = () => {
                const elements = document.getElementsByClassName(className);
                if (elements.length > index) {
                    elements[index].click();
                    console.log(`Clicked element: ${className}[${index}]`);
                    return;
                }
                setTimeout(checkForElement, 1000);
            };
            checkForElement();
        }
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => new GoogleMapsEnhancedEdits());
    } else {
        new GoogleMapsEnhancedEdits();
    }
})();
