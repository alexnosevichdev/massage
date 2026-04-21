(function () {
  'use strict';

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => ctx.querySelectorAll(sel);

  const LATE_SLOTS = ['18:30', '19:30'];

  const nav = $('#nav');
  const hamburger = $('#hamburger');
  const navLinks = $('#navLinks');
  const themeToggle = $('#themeToggle');
  const calMonthLabel = $('#calMonth');
  const calDays = $('#calDays');
  const calPrev = $('#calPrev');
  const calNext = $('#calNext');
  const timeslotsGrid = $('#timeslotsGrid');
  const timeslotsEmpty = $('#timeslotsEmpty');
  const timeslotsUnavailable = $('#timeslotsUnavailable');
  const timeslotsDurationWarn = $('#timeslotsDurationWarn');
  const bookingForm = $('#bookingForm');
  const bookSubmit = $('#bookSubmit');
  const bookingSummary = $('#bookingSummary');
  const summaryDate = $('#summaryDate');
  const summaryTime = $('#summaryTime');
  const bookingStatus = $('#bookingStatus');
  const toast = $('#toast');
  const confirmModal = $('#confirmModal');
  const modalText = $('#modalText');
  const modalClose = $('#modalClose');
  const modalDone = $('#modalDone');

  const bookDate = $('#bookDate');
  const bookTime = $('#bookTime');

  // ─── State ──────────────────────────────────────────

  let calYear, calMonthIdx;
  let selectedDate = null;
  let selectedTime = null;
  let selectedDuration = 60;
  let selectedPrice = 140;

  // ─── Phone Formatting ──────────────────────────────

  function formatPhoneInput(input) {
    input.addEventListener('input', (e) => {
      let digits = e.target.value.replace(/\D/g, '');
      if (digits.startsWith('1')) digits = digits.slice(1);
      digits = digits.slice(0, 10);
      let formatted = '';
      if (digits.length === 0) {
        formatted = '';
      } else if (digits.length <= 3) {
        formatted = `+1 (${digits}`;
      } else if (digits.length <= 6) {
        formatted = `+1 (${digits.slice(0,3)}) ${digits.slice(3)}`;
      } else {
        formatted = `+1 (${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
      }
      e.target.value = formatted;
    });
    input.addEventListener('paste', (e) => {
      e.preventDefault();
      const pasted = (e.clipboardData || window.clipboardData).getData('text');
      const digits = pasted.replace(/\D/g, '').replace(/^1/, '').slice(0, 10);
      input.value = digits;
      input.dispatchEvent(new Event('input'));
    });
  }

  function getRawPhone(formattedValue) {
    const digits = formattedValue.replace(/\D/g, '');
    return digits.startsWith('1') ? '+' + digits : '+1' + digits;
  }

  document.querySelectorAll('input[type="tel"]').forEach(formatPhoneInput);

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

  // ─── Duration Toggle ───────────────────────────────

  function applyDurationRestrictions() {
    timeslotsDurationWarn.hidden = true;
    $$('.timeslot').forEach(btn => {
      const slotTime = btn.textContent;
      if (selectedDuration === 90 && LATE_SLOTS.includes(slotTime)) {
        btn.classList.add('disabled-duration');
        btn.classList.remove('timeslot--selected');
        if (selectedTime === slotTime) {
          selectedTime = null;
          bookTime.value = '';
          timeslotsDurationWarn.hidden = false;
          updateSummary();
        }
      } else if (!btn.disabled) {
        btn.classList.remove('disabled-duration');
      }
    });
  }

  $$('.duration-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.duration-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedDuration = parseInt(btn.dataset.duration, 10);
      selectedPrice = parseInt(btn.dataset.price, 10);
      applyDurationRestrictions();
      validateForm();
    });
  });

  // ─── Custom Calendar ───────────────────────────────

  const MONTHS = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];

  function todayISO() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function dateISO(y, m, d) {
    return y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }

  function getMaxMonth() {
    const now = new Date();
    let m = now.getMonth() + 2;
    let y = now.getFullYear();
    if (m > 11) { m -= 12; y++; }
    return { year: y, month: m };
  }

  function initCalendar() {
    const now = new Date();
    calYear = now.getFullYear();
    calMonthIdx = now.getMonth();
    renderCalendar();
  }

  function renderCalendar() {
    calMonthLabel.textContent = `${MONTHS[calMonthIdx]} ${calYear}`;
    const now = new Date();
    const currentMonth = now.getFullYear() * 12 + now.getMonth();
    const viewMonth = calYear * 12 + calMonthIdx;
    const max = getMaxMonth();
    const maxMonth = max.year * 12 + max.month;
    calPrev.disabled = viewMonth <= currentMonth;
    calNext.disabled = viewMonth >= maxMonth;

    const firstDay = new Date(calYear, calMonthIdx, 1);
    const startDay = firstDay.getDay();
    const daysInMonth = new Date(calYear, calMonthIdx + 1, 0).getDate();
    const today = todayISO();

    calDays.innerHTML = '';
    for (let i = 0; i < startDay; i++) {
      const el = document.createElement('div');
      el.className = 'cal-day empty';
      calDays.appendChild(el);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = dateISO(calYear, calMonthIdx, d);
      const dayDate = new Date(calYear, calMonthIdx, d);
      const dayOfWeek = dayDate.getDay();
      const isPast = iso < today;
      const isWedOrFri = dayOfWeek === 3 || dayOfWeek === 5;

      const el = document.createElement('button');
      el.type = 'button';
      el.textContent = d;
      let cls = 'cal-day';
      if (isPast) { cls += ' past'; }
      else if (isWedOrFri) { cls += ' available'; }
      if (iso === today && isWedOrFri && !isPast) { cls += ' today'; }
      if (iso === selectedDate) { cls += ' selected'; }
      el.className = cls;
      if (!isPast && isWedOrFri) {
        el.addEventListener('click', () => selectDate(iso));
      }
      calDays.appendChild(el);
    }
  }

  calPrev.addEventListener('click', () => {
    const now = new Date();
    if (calYear * 12 + calMonthIdx <= now.getFullYear() * 12 + now.getMonth()) return;
    calMonthIdx--;
    if (calMonthIdx < 0) { calMonthIdx = 11; calYear--; }
    renderCalendar();
  });
  calNext.addEventListener('click', () => {
    const max = getMaxMonth();
    if (calYear * 12 + calMonthIdx >= max.year * 12 + max.month) return;
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
    timeslotsGrid.innerHTML = '<span class="timeslots__label" style="text-align:center;padding:12px;">Loading…</span>';
    timeslotsEmpty.hidden = true;
    timeslotsUnavailable.hidden = true;
    timeslotsDurationWarn.hidden = true;

    try {
      const res = await fetch(`/api/slots?date=${iso}`);
      const data = await res.json();
      if (data.unavailable) {
        timeslotsGrid.innerHTML = '';
        timeslotsUnavailable.hidden = false;
        return;
      }
      const available = data.slots.filter(s => !data.booked.includes(s));
      timeslotsGrid.innerHTML = '';
      timeslotsUnavailable.hidden = true;
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
      applyDurationRestrictions();
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
    if (selectedDuration === 90 && LATE_SLOTS.includes(time)) return;
    selectedTime = time;
    bookTime.value = time;
    timeslotsDurationWarn.hidden = true;
    updateSummary();
    $$('.timeslot').forEach(btn => {
      btn.classList.toggle('timeslot--selected', btn.textContent === time && !btn.classList.contains('disabled-duration'));
    });
  }

  function updateSummary() {
    if (selectedDate && selectedTime) {
      const d = new Date(selectedDate + 'T00:00:00');
      summaryDate.textContent = d.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric' });
      summaryTime.textContent = selectedTime;
      bookingSummary.hidden = false;
    } else {
      bookingSummary.hidden = true;
    }
    validateForm();
  }

  // ─── Form validation ───────────────────────────────

  function validateForm() {
    const name = $('#bookName').value.trim();
    const phone = $('#bookPhone').value.trim();
    const date = bookDate.value;
    const time = bookTime.value;
    bookSubmit.disabled = !(name && phone && date && time);
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
      phone: getRawPhone($('#bookPhone').value),
      date: bookDate.value,
      time: bookTime.value,
      duration: selectedDuration,
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
        showConfirmModal(payload);
        bookingForm.reset();
        selectedDate = null;
        selectedTime = null;
        bookDate.value = '';
        bookTime.value = '';
        bookingSummary.hidden = true;
        timeslotsGrid.innerHTML = '';
        timeslotsDurationWarn.hidden = true;
        selectedDuration = 60;
        selectedPrice = 140;
        $$('.duration-btn').forEach(b => b.classList.toggle('active', b.dataset.duration === '60'));
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

  function showConfirmModal(booking) {
    const d = new Date(booking.date + 'T00:00:00');
    const formatted = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    const dur = booking.duration || 60;
    const price = dur === 90 ? 200 : 140;
    modalText.textContent = `${dur} min session ($${price}) on ${formatted} at ${booking.time}.`;
    confirmModal.hidden = false;
  }

  function closeModal() { confirmModal.hidden = true; }
  modalClose.addEventListener('click', closeModal);
  modalDone.addEventListener('click', closeModal);
  confirmModal.addEventListener('click', (e) => { if (e.target === confirmModal) closeModal(); });

  // ─── Cancel section (phone-based) ──────────────────

  const cancelLookupForm = $('#cancelLookupForm');
  const cancelResults = $('#cancelResults');

  if (cancelLookupForm) {
    cancelLookupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      cancelResults.innerHTML = '<p style="color:var(--color-text-tertiary);">Looking up...</p>';
      const phone = getRawPhone($('#cancelPhone').value);
      try {
        const res = await fetch('/api/cancel/lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone }),
        });
        const data = await res.json();
        if (!data.success || !data.appointments || data.appointments.length === 0) {
          cancelResults.innerHTML = '<p class="cancel-empty">No upcoming appointments found for this phone number.</p>';
          return;
        }
        cancelResults.innerHTML = '';
        data.appointments.forEach(appt => {
          const d = new Date(appt.appointment_date + 'T00:00:00');
          const formatted = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
          const card = document.createElement('div');
          card.className = 'cancel-card';
          card.innerHTML =
            `<p>\uD83D\uDCC5 ${formatted} \u00B7 ${appt.appointment_time}</p>` +
            `<p>\uD83D\uDC86 ${appt.service}</p>` +
            `<button class="btn btn--danger btn--small btn-cancel-appointment" data-id="${appt.id}">Cancel this appointment</button>`;
          card.querySelector('.btn-cancel-appointment').addEventListener('click', () => {
            const ok = confirm(`Are you sure you want to cancel your appointment on ${formatted} at ${appt.appointment_time}?`);
            if (ok) confirmCancel(appt.id, phone, card);
          });
          cancelResults.appendChild(card);
        });
      } catch (err) {
        cancelResults.innerHTML = '<p style="color:var(--color-danger);">Network error. Please try again.</p>';
      }
    });
  }

  async function confirmCancel(id, phone, cardEl) {
    try {
      const res = await fetch('/api/cancel/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, phone }),
      });
      const data = await res.json();
      if (data.success) {
        cardEl.innerHTML = `<p style="color:var(--color-success);">\u2714 ${data.message}</p>`;
      } else {
        showToast(data.error || 'Cancellation failed.', true);
      }
    } catch (err) {
      showToast('Network error. Please try again.', true);
    }
  }

  // ─── Smooth scroll ──────────────────────────────────

  $$('a[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
      const target = document.querySelector(link.getAttribute('href'));
      if (target) { e.preventDefault(); target.scrollIntoView({ behavior: 'smooth' }); }
    });
  });

  // ─── Read more toggle ──────────────────────────────

  const readMoreBtn = $('#readMoreBtn');
  const bioFull = $('.bio-full');
  const bioFade = $('.bio-fade');
  if (readMoreBtn) {
    readMoreBtn.addEventListener('click', () => {
      const isExpanded = !bioFull.hidden;
      bioFull.hidden = isExpanded;
      bioFade.style.display = isExpanded ? 'block' : 'none';
      readMoreBtn.textContent = isExpanded ? 'Read more' : 'Read less';
    });
  }

  // ─── FAQ Accordion ──────────────────────────────────

  document.querySelectorAll('.faq-question').forEach(btn => {
    btn.addEventListener('click', () => {
      const answer = btn.nextElementSibling;
      const isOpen = btn.getAttribute('aria-expanded') === 'true';
      document.querySelectorAll('.faq-question').forEach(b => {
        b.setAttribute('aria-expanded', 'false');
        b.nextElementSibling.hidden = true;
      });
      if (!isOpen) { btn.setAttribute('aria-expanded', 'true'); answer.hidden = false; }
    });
  });

  // ─── Reviews Carousel ──────────────────────────────

  const PLACEHOLDER_REVIEWS = [
    { reviewer_name: 'Michael R.', review_text: 'Best sports massage I\'ve had. Helped enormously with my marathon recovery. Andrei really knows how to work with muscle tension.', rating: 5 },
    { reviewer_name: 'Sarah K.', review_text: 'Professional, calm, and genuinely knowledgeable. I come every two weeks now. My chronic neck pain has improved significantly.', rating: 5 },
    { reviewer_name: 'James T.', review_text: 'Andrei has a remarkable understanding of the body. My back pain of 3 years is finally manageable. Highly recommend.', rating: 5 },
  ];
  let allReviews = [];
  let carouselPage = 0;

  function renderStars(count) { return '\u2605'.repeat(count) + '\u2606'.repeat(5 - count); }

  function renderReviewCards(reviews) {
    const carousel = $('#reviewsCarousel');
    carousel.innerHTML = '';
    const perPage = window.innerWidth <= 900 ? 1 : 3;
    const totalPages = Math.ceil(reviews.length / perPage);
    const visible = reviews.slice(carouselPage * perPage, carouselPage * perPage + perPage);
    visible.forEach(r => {
      const card = document.createElement('div');
      card.className = 'review-card';
      card.innerHTML = `<div class="review-stars">${renderStars(r.rating || 5)}</div><p class="review-text">"${r.review_text}"</p><p class="review-author">\u2014 ${r.reviewer_name}</p>`;
      carousel.appendChild(card);
    });
    const controls = $('#carouselControls');
    const dotsContainer = $('#carouselDots');
    if (totalPages > 1) {
      controls.hidden = false;
      dotsContainer.innerHTML = '';
      for (let i = 0; i < totalPages; i++) {
        const dot = document.createElement('button');
        dot.className = 'carousel-dot' + (i === carouselPage ? ' active' : '');
        dot.addEventListener('click', () => { carouselPage = i; renderReviewCards(allReviews); });
        dotsContainer.appendChild(dot);
      }
    } else { controls.hidden = true; }
  }

  function loadReviews() {
    fetch('/api/reviews').then(r => r.json()).then(data => {
      allReviews = data.reviews && data.reviews.length > 0 ? data.reviews : PLACEHOLDER_REVIEWS;
      carouselPage = 0; renderReviewCards(allReviews);
    }).catch(() => { allReviews = PLACEHOLDER_REVIEWS; carouselPage = 0; renderReviewCards(allReviews); });
  }

  const prevBtn = $('#carouselPrev');
  const nextBtn = $('#carouselNext');
  if (prevBtn) prevBtn.addEventListener('click', () => { const pp = window.innerWidth <= 900 ? 1 : 3; const tp = Math.ceil(allReviews.length / pp); carouselPage = (carouselPage - 1 + tp) % tp; renderReviewCards(allReviews); });
  if (nextBtn) nextBtn.addEventListener('click', () => { const pp = window.innerWidth <= 900 ? 1 : 3; const tp = Math.ceil(allReviews.length / pp); carouselPage = (carouselPage + 1) % tp; renderReviewCards(allReviews); });
  window.addEventListener('resize', () => renderReviewCards(allReviews));

  // ─── Star Rating ────────────────────────────────────

  let selectedRating = 5;
  const starBtns = $$('.star-btn');
  function updateStars(rating) { starBtns.forEach(btn => btn.classList.toggle('active', parseInt(btn.dataset.rating, 10) <= rating)); }
  starBtns.forEach(btn => {
    btn.addEventListener('click', () => { selectedRating = parseInt(btn.dataset.rating, 10); updateStars(selectedRating); });
    btn.addEventListener('mouseenter', () => updateStars(parseInt(btn.dataset.rating, 10)));
    btn.addEventListener('mouseleave', () => updateStars(selectedRating));
  });
  updateStars(selectedRating);

  // ─── Review Form ────────────────────────────────────

  const reviewForm = $('#reviewForm');
  const reviewStatusEl = $('#reviewStatus');
  if (reviewForm) {
    reviewForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      reviewStatusEl.textContent = '';
      const payload = {
        name: $('#reviewName').value.trim(),
        phone: getRawPhone($('#reviewPhone').value),
        text: $('#reviewText').value.trim(),
        rating: selectedRating,
      };
      try {
        const res = await fetch('/api/reviews/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const data = await res.json();
        if (data.success) {
          reviewStatusEl.innerHTML = `<span style="color:var(--color-success);">${data.message}</span>`;
          reviewForm.reset(); selectedRating = 5; updateStars(selectedRating);
        } else {
          reviewStatusEl.innerHTML = `<span style="color:var(--color-danger);">${data.error}</span>`;
        }
      } catch (err) {
        reviewStatusEl.innerHTML = '<span style="color:var(--color-danger);">Network error. Please try again.</span>';
      }
    });
  }

  // ─── Init ───────────────────────────────────────────

  initTheme();
  initCalendar();
  loadReviews();

})();
