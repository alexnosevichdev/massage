(function () {
  'use strict';

  // ─── DOM refs ───────────────────────────────────────

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => ctx.querySelectorAll(sel);

  const nav = $('#nav');
  const hamburger = $('#hamburger');
  const navLinks = $('#navLinks');
  const themeToggle = $('#themeToggle');
  const calMonth = $('#calMonth');
  const calDays = $('#calDays');
  const calPrev = $('#calPrev');
  const calNext = $('#calNext');
  const timeslotsGrid = $('#timeslotsGrid');
  const timeslotsEmpty = $('#timeslotsEmpty');
  const bookingForm = $('#bookingForm');
  const bookSubmit = $('#bookSubmit');
  const bookingSummary = $('#bookingSummary');
  const summaryDate = $('#summaryDate');
  const summaryTime = $('#summaryTime');
  const bookingStatus = $('#bookingStatus');
  const cancelForm = $('#cancelForm');
  const cancelStatus = $('#cancelStatus');
  const toast = $('#toast');
  const confirmModal = $('#confirmModal');
  const modalText = $('#modalText');
  const modalToken = $('#modalToken');
  const modalCopy = $('#modalCopy');
  const modalClose = $('#modalClose');
  const modalDone = $('#modalDone');

  // Hidden form fields
  const bookDate = $('#bookDate');
  const bookTime = $('#bookTime');
  const bookService = $('#bookService');
  const bookDuration = $('#bookDuration');
  const bookSelectedService = $('#bookSelectedService');

  // ─── State ──────────────────────────────────────────

  let calYear, calMonthIdx; // current calendar view
  let selectedDate = null;
  let selectedTime = null;

  // ─── Theme ──────────────────────────────────────────

  function initTheme() {
    const stored = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = stored || (prefersDark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
  }

  themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
  });

  // ─── Nav scroll effect ──────────────────────────────

  let ticking = false;
  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        nav.classList.toggle('nav--scrolled', window.scrollY > 20);
        ticking = false;
      });
      ticking = true;
    }
  });

  // ─── Mobile menu ────────────────────────────────────

  hamburger.addEventListener('click', () => {
    const open = hamburger.getAttribute('aria-expanded') === 'true';
    hamburger.setAttribute('aria-expanded', String(!open));
    navLinks.classList.toggle('nav__links--open', !open);
  });

  $$('.nav__link').forEach(link => {
    link.addEventListener('click', () => {
      hamburger.setAttribute('aria-expanded', 'false');
      navLinks.classList.remove('nav__links--open');
    });
  });

  // ─── Footer year ────────────────────────────────────

  const yearEl = $('#currentYear');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // ─── Toast ──────────────────────────────────────────

  let toastTimer;
  function showToast(msg, isError = false) {
    clearTimeout(toastTimer);
    toast.textContent = msg;
    toast.classList.toggle('toast--error', isError);
    toast.classList.add('toast--visible');
    toastTimer = setTimeout(() => toast.classList.remove('toast--visible'), 4000);
  }

  // ─── Calendar ───────────────────────────────────────

  const MONTHS = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];

  function todayISO() {
    const d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function dateISO(y, m, d) {
    return y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }

  function initCalendar() {
    const now = new Date();
    calYear = now.getFullYear();
    calMonthIdx = now.getMonth();
    renderCalendar();
  }

  function renderCalendar() {
    calMonth.textContent = `${MONTHS[calMonthIdx]} ${calYear}`;

    const firstDay = new Date(calYear, calMonthIdx, 1);
    let startDay = firstDay.getDay(); // 0=Sun
    startDay = startDay === 0 ? 6 : startDay - 1; // convert to Mon=0

    const daysInMonth = new Date(calYear, calMonthIdx + 1, 0).getDate();
    const today = todayISO();

    calDays.innerHTML = '';

    // Empty cells for offset
    for (let i = 0; i < startDay; i++) {
      const el = document.createElement('div');
      el.className = 'calendar__day calendar__day--empty';
      calDays.appendChild(el);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const iso = dateISO(calYear, calMonthIdx, d);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'calendar__day';
      btn.textContent = d;

      if (iso === today) btn.classList.add('calendar__day--today');
      if (iso === selectedDate) btn.classList.add('calendar__day--selected');
      if (iso < today) {
        btn.disabled = true;
      } else {
        btn.addEventListener('click', () => selectDate(iso));
      }

      calDays.appendChild(btn);
    }
  }

  calPrev.addEventListener('click', () => {
    calMonthIdx--;
    if (calMonthIdx < 0) { calMonthIdx = 11; calYear--; }
    renderCalendar();
  });

  calNext.addEventListener('click', () => {
    calMonthIdx++;
    if (calMonthIdx > 11) { calMonthIdx = 0; calYear++; }
    renderCalendar();
  });

  // ─── Date & Time selection ──────────────────────────

  async function selectDate(iso) {
    selectedDate = iso;
    selectedTime = null;
    bookDate.value = iso;
    bookTime.value = '';
    updateSummary();
    renderCalendar();

    timeslotsGrid.innerHTML = '<span class="timeslots__label" style="grid-column:1/-1;text-align:center;padding:12px;">Loading…</span>';
    timeslotsEmpty.hidden = true;

    try {
      const res = await fetch(`/api/slots?date=${iso}`);
      const data = await res.json();

      if (data.dayOff) {
        timeslotsGrid.innerHTML = '';
        timeslotsEmpty.textContent = 'This is a day off.';
        timeslotsEmpty.hidden = false;
        return;
      }

      const available = data.slots.filter(s => !data.booked.includes(s));
      timeslotsGrid.innerHTML = '';

      if (data.slots.length === 0) {
        timeslotsEmpty.textContent = 'No available slots for this date.';
        timeslotsEmpty.hidden = false;
        return;
      }

      timeslotsEmpty.hidden = true;

      data.slots.forEach(slot => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'timeslot';
        btn.textContent = slot;

        if (data.booked.includes(slot)) {
          btn.disabled = true;
        } else {
          btn.addEventListener('click', () => selectTime(slot));
        }

        timeslotsGrid.appendChild(btn);
      });

      if (available.length === 0) {
        timeslotsEmpty.textContent = 'All slots are booked for this date.';
        timeslotsEmpty.hidden = false;
      }

    } catch (err) {
      timeslotsGrid.innerHTML = '';
      timeslotsEmpty.textContent = 'Failed to load slots. Try again.';
      timeslotsEmpty.hidden = false;
    }
  }

  function selectTime(time) {
    selectedTime = time;
    bookTime.value = time;
    updateSummary();

    $$('.timeslot').forEach(btn => {
      btn.classList.toggle('timeslot--selected', btn.textContent === time);
    });
  }

  function updateSummary() {
    if (selectedDate && selectedTime) {
      const d = new Date(selectedDate + 'T00:00:00');
      const formatted = d.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric' });
      summaryDate.textContent = formatted;
      summaryTime.textContent = selectedTime;
      bookingSummary.hidden = false;
    } else {
      bookingSummary.hidden = true;
    }
    validateForm();
  }

  // ─── Service selection from cards ───────────────────

  $$('[data-book]').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.service-card');
      const service = card.dataset.service;
      const duration = card.dataset.duration;
      bookSelectedService.value = `${service}|${duration}`;
      bookService.value = service;
      bookDuration.value = duration;
      document.getElementById('booking').scrollIntoView({ behavior: 'smooth' });
      validateForm();
    });
  });

  bookSelectedService.addEventListener('change', () => {
    const val = bookSelectedService.value;
    if (val) {
      const [service, duration] = val.split('|');
      bookService.value = service;
      bookDuration.value = duration;
    } else {
      bookService.value = '';
      bookDuration.value = '';
    }
    validateForm();
  });

  // ─── Form validation ───────────────────────────────

  function validateForm() {
    const name = $('#bookName').value.trim();
    const phone = $('#bookPhone').value.trim();
    const service = bookService.value;
    const date = bookDate.value;
    const time = bookTime.value;
    bookSubmit.disabled = !(name && phone && service && date && time);
  }

  ['bookName', 'bookPhone'].forEach(id => {
    $(`#${id}`).addEventListener('input', validateForm);
  });

  // ─── Booking submit ─────────────────────────────────

  bookingForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    bookSubmit.disabled = true;
    bookingStatus.textContent = '';

    const payload = {
      name: $('#bookName').value.trim(),
      phone: $('#bookPhone').value.trim(),
      service: bookService.value,
      duration: parseInt(bookDuration.value, 10),
      date: bookDate.value,
      time: bookTime.value,
      comment: $('#bookComment').value.trim(),
    };

    try {
      const res = await fetch('/api/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (data.success) {
        showConfirmModal(payload, data.token);
        bookingForm.reset();
        bookService.value = '';
        bookDuration.value = '';
        selectedDate = null;
        selectedTime = null;
        bookDate.value = '';
        bookTime.value = '';
        bookingSummary.hidden = true;
        timeslotsGrid.innerHTML = '';
        renderCalendar();
      } else {
        showToast(data.error || 'Booking failed.', true);
        if (selectedDate) selectDate(selectedDate);
      }
    } catch (err) {
      showToast('Network error. Please try again.', true);
    }

    bookSubmit.disabled = false;
  });

  // ─── Confirmation modal ─────────────────────────────

  function showConfirmModal(booking, token) {
    const d = new Date(booking.date + 'T00:00:00');
    const formatted = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    modalText.textContent = `${booking.service} on ${formatted} at ${booking.time}.`;
    modalToken.textContent = token;
    confirmModal.hidden = false;
  }

  function closeModal() {
    confirmModal.hidden = true;
  }

  modalClose.addEventListener('click', closeModal);
  modalDone.addEventListener('click', closeModal);
  confirmModal.addEventListener('click', (e) => {
    if (e.target === confirmModal) closeModal();
  });

  modalCopy.addEventListener('click', () => {
    navigator.clipboard.writeText(modalToken.textContent).then(() => {
      modalCopy.textContent = 'Copied!';
      setTimeout(() => { modalCopy.textContent = 'Copy'; }, 2000);
    });
  });

  // ─── Cancel section ─────────────────────────────────

  // Show cancel section if URL has #cancel
  if (window.location.hash === '#cancel') {
    $('#cancel').hidden = false;
  }

  window.addEventListener('hashchange', () => {
    if (window.location.hash === '#cancel') {
      $('#cancel').hidden = false;
    }
  });

  cancelForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    cancelStatus.textContent = '';

    const token = $('#cancelToken').value.trim();
    if (!token) return;

    try {
      const res = await fetch('/api/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      const data = await res.json();

      if (data.success) {
        cancelStatus.innerHTML = `<span style="color:var(--color-success);">${data.message}</span>`;
        cancelForm.reset();
      } else {
        cancelStatus.innerHTML = `<span style="color:var(--color-danger);">${data.error}</span>`;
      }
    } catch (err) {
      cancelStatus.innerHTML = '<span style="color:var(--color-danger);">Network error. Please try again.</span>';
    }
  });

  // ─── Smooth scroll for anchor links ─────────────────

  $$('a[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
      const target = document.querySelector(link.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

  // ─── Init ───────────────────────────────────────────

  initTheme();
  initCalendar();

})();
