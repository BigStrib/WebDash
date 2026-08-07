(function () {
    'use strict';

    var STORAGE_KEY = 'dashboard_pages';

    var state = {
        pages: [],
        activePageId: null,
        sidebarOpen: false,
        editMode: false,
        editingPageId: null
    };

    var els = {
        sidebarTrigger: document.getElementById('sidebarTrigger'),
        overlay: document.getElementById('overlay'),
        sidebar: document.getElementById('sidebar'),
        closeSidebar: document.getElementById('closeSidebar'),
        urlName: document.getElementById('urlName'),
        urlInput: document.getElementById('urlInput'),
        addUrlBtn: document.getElementById('addUrlBtn'),
        pagesList: document.getElementById('pagesList'),
        editModeBtn: document.getElementById('editModeBtn'),
        canvas: document.getElementById('canvas'),
        emptyState: document.getElementById('emptyState'),
        iframeContainer: document.getElementById('iframeContainer'),
        tabsBar: document.getElementById('tabsBar'),
        editOverlay: document.getElementById('editOverlay'),
        editGrid: document.getElementById('editGrid'),
        doneEditBtn: document.getElementById('doneEditBtn'),
        editPageModal: document.getElementById('editPageModal'),
        editPageName: document.getElementById('editPageName'),
        editPageUrl: document.getElementById('editPageUrl'),
        closeEditModal: document.getElementById('closeEditModal'),
        cancelEditPage: document.getElementById('cancelEditPage'),
        saveEditPage: document.getElementById('saveEditPage'),
        toast: document.getElementById('toast')
    };

    // ---- Utilities ----

    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    }

    function normalizeUrl(url) {
        url = url.trim();
        if (!url) return '';
        if (!/^https?:\/\//i.test(url)) {
            url = 'https://' + url;
        }
        return url;
    }

    function getDomain(url) {
        try {
            return new URL(url).hostname;
        } catch (e) {
            return url;
        }
    }

    function getInitial(name) {
        return (name || '?').charAt(0).toUpperCase();
    }

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ---- Storage ----

    function saveState() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                pages: state.pages,
                activePageId: state.activePageId
            }));
        } catch (e) {
            console.warn('Save failed:', e);
        }
    }

    function loadState() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                var data = JSON.parse(raw);
                state.pages = data.pages || [];
                state.activePageId = data.activePageId || null;
                if (state.activePageId && !state.pages.find(function (p) { return p.id === state.activePageId; })) {
                    state.activePageId = state.pages.length > 0 ? state.pages[0].id : null;
                }
            }
        } catch (e) {
            console.warn('Load failed:', e);
            state.pages = [];
            state.activePageId = null;
        }
    }

    // ---- Toast ----

    var toastTimer = null;

    function showToast(message, type) {
        type = type || 'success';
        clearTimeout(toastTimer);
        els.toast.textContent = message;
        els.toast.className = 'toast ' + type;
        void els.toast.offsetWidth;
        els.toast.classList.add('show');
        toastTimer = setTimeout(function () {
            els.toast.classList.remove('show');
        }, 2500);
    }

    // ---- Confirm ----

    function showConfirm(title, message) {
        return new Promise(function (resolve) {
            var overlay = document.createElement('div');
            overlay.className = 'confirm-overlay';
            overlay.innerHTML =
                '<div class="confirm-dialog">' +
                '<h3>' + title + '</h3>' +
                '<p>' + message + '</p>' +
                '<div class="confirm-actions">' +
                '<button class="confirm-cancel">Cancel</button>' +
                '<button class="confirm-delete">Remove</button>' +
                '</div></div>';

            document.body.appendChild(overlay);

            function close(result) {
                overlay.remove();
                resolve(result);
            }

            overlay.querySelector('.confirm-cancel').addEventListener('click', function () { close(false); });
            overlay.querySelector('.confirm-delete').addEventListener('click', function () { close(true); });
            overlay.addEventListener('click', function (e) {
                if (e.target === overlay) close(false);
            });
        });
    }

    // ---- Sidebar ----

    function openSidebar() {
        state.sidebarOpen = true;
        els.sidebar.classList.add('open');
        els.overlay.classList.add('active');
        els.sidebarTrigger.classList.add('hidden');
    }

    function closeSidebar() {
        state.sidebarOpen = false;
        els.sidebar.classList.remove('open');
        els.overlay.classList.remove('active');
        els.sidebarTrigger.classList.remove('hidden');
    }

    // ---- Swipe ----

    var touchStartX = 0;
    var touchStartY = 0;
    var touchStartTime = 0;
    var isSwiping = false;

    document.addEventListener('touchstart', function (e) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchStartTime = Date.now();
        isSwiping = false;

        if (!state.sidebarOpen && !state.editMode && touchStartX < 35) {
            isSwiping = true;
        }
        if (state.sidebarOpen) {
            isSwiping = true;
        }
    }, { passive: true });

    document.addEventListener('touchend', function (e) {
        if (!isSwiping) return;

        var touchEndX = e.changedTouches[0].clientX;
        var touchEndY = e.changedTouches[0].clientY;
        var deltaX = touchEndX - touchStartX;
        var deltaY = Math.abs(touchEndY - touchStartY);
        var elapsed = Date.now() - touchStartTime;

        if (deltaY > Math.abs(deltaX)) return;

        if (!state.sidebarOpen && deltaX > 60 && elapsed < 500) {
            openSidebar();
        }
        if (state.sidebarOpen && deltaX < -60 && elapsed < 500) {
            closeSidebar();
        }

        isSwiping = false;
    }, { passive: true });

    // ---- Page CRUD ----

    function addPage(name, url) {
        var normalizedUrl = normalizeUrl(url);
        if (!normalizedUrl) {
            showToast('Please enter a valid URL', 'error');
            return;
        }

        if (!name.trim()) {
            name = getDomain(normalizedUrl);
        }

        var exists = state.pages.find(function (p) { return p.url === normalizedUrl; });
        if (exists) {
            showToast('This URL already exists', 'error');
            return;
        }

        var page = {
            id: generateId(),
            name: name.trim(),
            url: normalizedUrl,
            addedAt: Date.now()
        };

        state.pages.push(page);
        state.activePageId = page.id;
        saveState();

        els.urlName.value = '';
        els.urlInput.value = '';

        renderAll();
        closeSidebar();
        showToast(page.name + ' added');
    }

    function removePage(id) {
        var page = state.pages.find(function (p) { return p.id === id; });
        if (!page) return Promise.resolve();

        return showConfirm(
            'Remove Website',
            'Remove <strong>' + escapeHtml(page.name) + '</strong> from your dashboard?'
        ).then(function (confirmed) {
            if (!confirmed) return;

            state.pages = state.pages.filter(function (p) { return p.id !== id; });

            var wrapper = document.querySelector('.iframe-wrapper[data-id="' + id + '"]');
            if (wrapper) wrapper.remove();

            if (state.activePageId === id) {
                state.activePageId = state.pages.length > 0 ? state.pages[0].id : null;
            }

            saveState();
            renderAll();
            showToast(page.name + ' removed');
        });
    }

    function updatePage(id, newName, newUrl) {
        var page = state.pages.find(function (p) { return p.id === id; });
        if (!page) return false;

        var normalizedUrl = normalizeUrl(newUrl);
        if (!normalizedUrl) {
            showToast('Please enter a valid URL', 'error');
            return false;
        }

        if (!newName.trim()) {
            newName = getDomain(normalizedUrl);
        }

        var duplicate = state.pages.find(function (p) {
            return p.url === normalizedUrl && p.id !== id;
        });
        if (duplicate) {
            showToast('This URL already exists', 'error');
            return false;
        }

        var urlChanged = page.url !== normalizedUrl;

        page.name = newName.trim();
        page.url = normalizedUrl;
        saveState();

        if (urlChanged) {
            var wrapper = document.querySelector('.iframe-wrapper[data-id="' + id + '"]');
            if (wrapper) wrapper.remove();
        }

        renderAll();
        showToast(page.name + ' updated');
        return true;
    }

    function switchPage(id) {
        if (state.activePageId === id) return;
        state.activePageId = id;
        saveState();
        renderIframes();
        renderTabs();
        renderPagesList();
    }

    // ---- Rendering ----

    function renderAll() {
        renderEmptyState();
        renderPagesList();
        renderIframes();
        renderTabs();
        if (state.editMode) {
            renderEditGrid();
        }
    }

    function renderEmptyState() {
        if (state.pages.length === 0) {
            els.emptyState.classList.remove('hidden');
            els.iframeContainer.classList.remove('has-tabs');
        } else {
            els.emptyState.classList.add('hidden');
        }
    }

    function renderPagesList() {
        if (state.pages.length === 0) {
            els.pagesList.innerHTML =
                '<div style="text-align:center;padding:20px 0;color:var(--text-muted);font-size:0.85rem;">No pages added yet</div>';
            return;
        }

        els.pagesList.innerHTML = '';

        state.pages.forEach(function (page) {
            var isActive = page.id === state.activePageId;

            var item = document.createElement('div');
            item.className = 'page-item' + (isActive ? ' active' : '');
            item.dataset.id = page.id;

            var dot = document.createElement('div');
            dot.className = 'page-item-dot';

            var info = document.createElement('div');
            info.className = 'page-item-info';
            info.innerHTML =
                '<div class="page-item-name">' + escapeHtml(page.name) + '</div>' +
                '<div class="page-item-url">' + escapeHtml(getDomain(page.url)) + '</div>';

            item.appendChild(dot);
            item.appendChild(info);

            item.addEventListener('click', function () {
                switchPage(page.id);
                closeSidebar();
            });

            els.pagesList.appendChild(item);
        });
    }

    function renderIframes() {
        var existingIds = [];
        els.iframeContainer.querySelectorAll('.iframe-wrapper').forEach(function (w) {
            existingIds.push(w.dataset.id);
        });

        state.pages.forEach(function (page) {
            if (existingIds.indexOf(page.id) === -1) {
                createIframeWrapper(page);
            }
        });

        els.iframeContainer.querySelectorAll('.iframe-wrapper').forEach(function (w) {
            var found = state.pages.find(function (p) { return p.id === w.dataset.id; });
            if (!found) w.remove();
        });

        els.iframeContainer.querySelectorAll('.iframe-wrapper').forEach(function (w) {
            if (w.dataset.id === state.activePageId) {
                w.classList.add('active');
            } else {
                w.classList.remove('active');
            }
        });

        if (state.pages.length > 1) {
            els.iframeContainer.classList.add('has-tabs');
        } else {
            els.iframeContainer.classList.remove('has-tabs');
        }
    }

    function createIframeWrapper(page) {
        var wrapper = document.createElement('div');
        wrapper.className = 'iframe-wrapper';
        wrapper.dataset.id = page.id;

        var loading = document.createElement('div');
        loading.className = 'iframe-loading';
        loading.innerHTML =
            '<div class="spinner"></div>' +
            '<span>Loading ' + escapeHtml(page.name) + '…</span>';

        var iframe = document.createElement('iframe');
        iframe.src = page.url;
        iframe.title = page.name;
        iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts allow-popups allow-forms allow-modals allow-popups-to-escape-sandbox');
        iframe.setAttribute('loading', 'lazy');
        iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');

        iframe.addEventListener('load', function () {
            loading.classList.add('hidden');
        });

        iframe.addEventListener('error', function () {
            loading.innerHTML =
                '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="1.5" stroke-linecap="round">' +
                '<circle cx="12" cy="12" r="10"></circle>' +
                '<line x1="15" y1="9" x2="9" y2="15"></line>' +
                '<line x1="9" y1="9" x2="15" y2="15"></line></svg>' +
                '<span>Failed to load ' + escapeHtml(page.name) + '</span>';
        });

        wrapper.appendChild(loading);
        wrapper.appendChild(iframe);
        els.iframeContainer.appendChild(wrapper);
    }

    function renderTabs() {
        if (state.pages.length <= 1) {
            els.tabsBar.classList.remove('visible');
            els.tabsBar.innerHTML = '';
            return;
        }

        els.tabsBar.classList.add('visible');
        els.tabsBar.innerHTML = '';

        state.pages.forEach(function (page) {
            var isActive = page.id === state.activePageId;

            var tab = document.createElement('div');
            tab.className = 'tab-item' + (isActive ? ' active' : '');
            tab.dataset.id = page.id;
            tab.textContent = page.name;

            tab.addEventListener('click', function () {
                switchPage(page.id);
            });

            els.tabsBar.appendChild(tab);
        });

        var activeTab = els.tabsBar.querySelector('.tab-item.active');
        if (activeTab) {
            setTimeout(function () {
                activeTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            }, 50);
        }
    }

    // ---- Edit Mode ----

    function enterEditMode() {
        state.editMode = true;
        els.editOverlay.classList.add('active');
        closeSidebar();
        renderEditGrid();
    }

    function exitEditMode() {
        state.editMode = false;
        els.editOverlay.classList.remove('active');
        renderAll();
    }

    function renderEditGrid() {
        if (state.pages.length === 0) {
            els.editGrid.innerHTML =
                '<div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--text-muted);">' +
                '<p>No websites to edit.</p></div>';
            return;
        }

        els.editGrid.innerHTML = '';

        state.pages.forEach(function (page, index) {
            var card = document.createElement('div');
            card.className = 'edit-card';
            card.dataset.id = page.id;
            card.dataset.index = index;
            card.setAttribute('draggable', 'true');

            // Preview
            var preview = document.createElement('div');
            preview.className = 'edit-card-preview';
            var letter = document.createElement('div');
            letter.className = 'preview-letter';
            letter.textContent = getInitial(page.name);
            preview.appendChild(letter);

            // Body
            var body = document.createElement('div');
            body.className = 'edit-card-body';

            var info = document.createElement('div');
            info.className = 'edit-card-info';
            info.innerHTML =
                '<div class="edit-card-name">' + escapeHtml(page.name) + '</div>' +
                '<div class="edit-card-url">' + escapeHtml(page.url) + '</div>';

            var actions = document.createElement('div');
            actions.className = 'edit-card-actions';

            // Drag
            var dragBtn = document.createElement('button');
            dragBtn.className = 'edit-card-btn drag-btn';
            dragBtn.title = 'Drag to reorder';
            dragBtn.setAttribute('aria-label', 'Drag to reorder');
            dragBtn.innerHTML =
                '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none">' +
                '<circle cx="9" cy="5" r="1.8"></circle><circle cx="15" cy="5" r="1.8"></circle>' +
                '<circle cx="9" cy="12" r="1.8"></circle><circle cx="15" cy="12" r="1.8"></circle>' +
                '<circle cx="9" cy="19" r="1.8"></circle><circle cx="15" cy="19" r="1.8"></circle></svg>';

            // Edit
            var editBtn = document.createElement('button');
            editBtn.className = 'edit-card-btn edit-btn';
            editBtn.title = 'Edit';
            editBtn.setAttribute('aria-label', 'Edit');
            editBtn.dataset.id = page.id;
            editBtn.innerHTML =
                '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>' +
                '<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';

            // Delete
            var deleteBtn = document.createElement('button');
            deleteBtn.className = 'edit-card-btn delete-btn';
            deleteBtn.title = 'Remove';
            deleteBtn.setAttribute('aria-label', 'Remove');
            deleteBtn.dataset.id = page.id;
            deleteBtn.innerHTML =
                '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
                '<polyline points="3 6 5 6 21 6"></polyline>' +
                '<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';

            actions.appendChild(dragBtn);
            actions.appendChild(editBtn);
            actions.appendChild(deleteBtn);

            body.appendChild(info);
            body.appendChild(actions);

            card.appendChild(preview);
            card.appendChild(body);

            editBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                openEditPageModal(page.id);
            });

            deleteBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                removePage(page.id).then(function () {
                    if (state.editMode) {
                        if (state.pages.length === 0) {
                            exitEditMode();
                        } else {
                            renderEditGrid();
                        }
                    }
                });
            });

            els.editGrid.appendChild(card);
        });

        setupDragAndDrop();
    }

    // ---- Edit Modal ----

    function openEditPageModal(id) {
        var page = state.pages.find(function (p) { return p.id === id; });
        if (!page) return;

        state.editingPageId = id;
        els.editPageName.value = page.name;
        els.editPageUrl.value = page.url;
        els.editPageModal.classList.add('active');

        setTimeout(function () {
            els.editPageName.focus();
            els.editPageName.select();
        }, 100);
    }

    function closeEditPageModal() {
        state.editingPageId = null;
        els.editPageModal.classList.remove('active');
        els.editPageName.value = '';
        els.editPageUrl.value = '';
    }

    function saveEditPageChanges() {
        if (!state.editingPageId) return;

        var success = updatePage(
            state.editingPageId,
            els.editPageName.value,
            els.editPageUrl.value
        );

        if (success) {
            closeEditPageModal();
            if (state.editMode) {
                renderEditGrid();
            }
        }
    }

    // ---- Drag & Drop ----

    function setupDragAndDrop() {
        var cards = els.editGrid.querySelectorAll('.edit-card');
        var draggedCard = null;
        var draggedIndex = -1;

        cards.forEach(function (card) {
            card.addEventListener('dragstart', function (e) {
                draggedCard = card;
                draggedIndex = parseInt(card.dataset.index);
                card.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', card.dataset.id);
                setTimeout(function () { card.style.opacity = '0.4'; }, 0);
            });

            card.addEventListener('dragend', function () {
                card.classList.remove('dragging');
                card.style.opacity = '';
                cards.forEach(function (c) { c.classList.remove('drag-over'); });
                draggedCard = null;
                draggedIndex = -1;
            });

            card.addEventListener('dragover', function (e) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (card !== draggedCard) {
                    card.classList.add('drag-over');
                }
            });

            card.addEventListener('dragleave', function () {
                card.classList.remove('drag-over');
            });

            card.addEventListener('drop', function (e) {
                e.preventDefault();
                card.classList.remove('drag-over');
                if (card === draggedCard || draggedCard === null) return;
                var targetIndex = parseInt(card.dataset.index);
                reorderPages(draggedIndex, targetIndex);
            });

            // Touch drag
            var touchStarted = false;
            var longPressTimer = null;
            var touchCurrentTarget = null;

            card.addEventListener('touchstart', function (e) {
                if (e.target.closest('.drag-btn')) {
                    e.preventDefault();
                    startTouchDrag(card);
                    return;
                }
                longPressTimer = setTimeout(function () {
                    startTouchDrag(card);
                }, 400);
            }, { passive: false });

            card.addEventListener('touchmove', function (e) {
                if (!touchStarted) {
                    clearTimeout(longPressTimer);
                    return;
                }
                e.preventDefault();

                var touch = e.touches[0];
                var el = document.elementFromPoint(touch.clientX, touch.clientY);
                cards.forEach(function (c) { c.classList.remove('drag-over'); });

                if (el) {
                    var target = el.closest('.edit-card');
                    if (target && target !== draggedCard) {
                        target.classList.add('drag-over');
                        touchCurrentTarget = target;
                    } else {
                        touchCurrentTarget = null;
                    }
                }
            }, { passive: false });

            card.addEventListener('touchend', function () {
                clearTimeout(longPressTimer);
                if (!touchStarted) return;

                touchStarted = false;
                if (draggedCard) draggedCard.classList.remove('dragging');
                cards.forEach(function (c) { c.classList.remove('drag-over'); });

                if (touchCurrentTarget && touchCurrentTarget !== draggedCard) {
                    var targetIndex = parseInt(touchCurrentTarget.dataset.index);
                    reorderPages(draggedIndex, targetIndex);
                }

                draggedCard = null;
                draggedIndex = -1;
                touchCurrentTarget = null;
            });

            card.addEventListener('touchcancel', function () {
                clearTimeout(longPressTimer);
                touchStarted = false;
                if (draggedCard) draggedCard.classList.remove('dragging');
                cards.forEach(function (c) { c.classList.remove('drag-over'); });
                draggedCard = null;
                draggedIndex = -1;
                touchCurrentTarget = null;
            });

            function startTouchDrag(src) {
                touchStarted = true;
                draggedCard = src;
                draggedIndex = parseInt(src.dataset.index);
                src.classList.add('dragging');
                if (navigator.vibrate) navigator.vibrate(30);
            }
        });
    }

    function reorderPages(fromIndex, toIndex) {
        if (fromIndex === toIndex) return;
        var moved = state.pages.splice(fromIndex, 1)[0];
        state.pages.splice(toIndex, 0, moved);
        saveState();
        renderEditGrid();
        showToast('Order updated');
    }

    // ---- Init ----

    function init() {
        loadState();
        renderAll();

        els.sidebarTrigger.addEventListener('click', openSidebar);
        els.sidebarTrigger.addEventListener('touchend', function (e) {
            e.preventDefault();
            openSidebar();
        });

        els.closeSidebar.addEventListener('click', closeSidebar);
        els.overlay.addEventListener('click', closeSidebar);

        els.addUrlBtn.addEventListener('click', function () {
            addPage(els.urlName.value, els.urlInput.value);
        });

        els.urlInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') addPage(els.urlName.value, els.urlInput.value);
        });

        els.urlName.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') els.urlInput.focus();
        });

        els.editModeBtn.addEventListener('click', function () {
            if (state.pages.length === 0) {
                showToast('Add some websites first', 'error');
                return;
            }
            enterEditMode();
        });

        els.doneEditBtn.addEventListener('click', exitEditMode);

        els.closeEditModal.addEventListener('click', closeEditPageModal);
        els.cancelEditPage.addEventListener('click', closeEditPageModal);
        els.saveEditPage.addEventListener('click', saveEditPageChanges);

        els.editPageModal.addEventListener('click', function (e) {
            if (e.target === els.editPageModal) closeEditPageModal();
        });

        els.editPageName.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') els.editPageUrl.focus();
        });

        els.editPageUrl.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') saveEditPageChanges();
        });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                if (els.editPageModal.classList.contains('active')) {
                    closeEditPageModal();
                } else if (state.editMode) {
                    exitEditMode();
                } else if (state.sidebarOpen) {
                    closeSidebar();
                }
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();