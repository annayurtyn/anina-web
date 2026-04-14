// =====================
// NAV — scroll & mobile
// =====================
var nav = document.getElementById('nav');
var navToggle = document.getElementById('navToggle');
var navLinks = document.getElementById('navLinks');

window.addEventListener('scroll', function () {
  if (window.scrollY > 40) {
    nav.classList.add('scrolled');
  } else {
    nav.classList.remove('scrolled');
  }
});

navToggle.addEventListener('click', function () {
  navLinks.classList.toggle('open');
});

// Close mobile menu on link click
navLinks.querySelectorAll('a').forEach(function (link) {
  link.addEventListener('click', function () {
    navLinks.classList.remove('open');
  });
});

// =====================
// SMOOTH SCROLL
// =====================
document.querySelectorAll('a[href^="#"]').forEach(function (link) {
  link.addEventListener('click', function (e) {
    var target = document.querySelector(this.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth' });
    }
  });
});

// =====================
// CAROUSEL — 3 visible + peek of 4th
// =====================
var track = document.getElementById('carouselTrack');
var slides = track.querySelectorAll('.carousel-slide');
var dotsContainer = document.getElementById('carouselDots');
var prevBtn = document.getElementById('carouselPrev');
var nextBtn = document.getElementById('carouselNext');
var current = 0;
var total = slides.length;

function slideStep() {
  // width of one slide + its margin
  var s = slides[0];
  return s.offsetWidth + 20;
}

function maxIndex() {
  return total - 3; // can scroll until last 3 are showing
}

function buildDots() {
  dotsContainer.innerHTML = '';
  var pages = maxIndex() + 1;
  for (var i = 0; i < pages; i++) {
    (function(idx) {
      var dot = document.createElement('button');
      dot.className = 'carousel-dot' + (idx === 0 ? ' active' : '');
      dot.setAttribute('aria-label', 'Slide ' + (idx + 1));
      dot.addEventListener('click', function () { goTo(idx); });
      dotsContainer.appendChild(dot);
    })(i);
  }
}

function updateBtns() {
  prevBtn.style.visibility = current === 0 ? 'hidden' : 'visible';
  nextBtn.style.visibility = current >= maxIndex() ? 'hidden' : 'visible';
}

function goTo(index) {
  current = Math.min(Math.max(index, 0), maxIndex());
  track.style.transform = 'translateX(-' + (current * slideStep()) + 'px)';
  track.style.transition = 'transform 0.4s ease';
  dotsContainer.querySelectorAll('.carousel-dot').forEach(function (d, i) {
    d.classList.toggle('active', i === current);
  });
  updateBtns();
}

buildDots();
updateBtns();

prevBtn.addEventListener('click', function () { goTo(current - 1); });
nextBtn.addEventListener('click', function () { goTo(current + 1); });

window.addEventListener('resize', function () { goTo(0); });

// Touch/swipe
var touchStartX = 0;
track.addEventListener('touchstart', function (e) {
  touchStartX = e.touches[0].clientX;
}, { passive: true });

track.addEventListener('touchend', function (e) {
  var diff = touchStartX - e.changedTouches[0].clientX;
  if (Math.abs(diff) > 40) {
    goTo(diff > 0 ? current + 1 : current - 1);
  }
}, { passive: true });

// =====================
// CONTACT FORM
// =====================
document.getElementById('contactForm').addEventListener('submit', function (e) {
  e.preventDefault();
  var btn = this.querySelector('button[type="submit"]');
  var lang = document.documentElement.lang || 'cs';
  var sentMsg = { cs: 'Odesláno ✓', uk: 'Надіслано ✓', en: 'Sent ✓' };
  btn.textContent = sentMsg[lang] || sentMsg.cs;
  btn.disabled = true;
  btn.style.backgroundColor = '#5a6a72';
});

// =====================
// SCROLL ANIMATIONS
// =====================
var animTargets = document.querySelectorAll(
  '.about-content, .about-photo, ' +
  '.testimonials-heading, .testimonials-label, .carousel-wrap, ' +
  '.community-text, .community-screens, ' +
  '.tz-text, .tz-visual, ' +
  '.why-heading, .why-label, .tl-item, ' +
  '.pricing-block, ' +
  '.contact-left, .contact-right, ' +
  '.hero-stats'
);

animTargets.forEach(function (el) {
  el.classList.add('anim-hidden');
});

var observer = new IntersectionObserver(function (entries) {
  entries.forEach(function (entry) {
    if (entry.isIntersecting) {
      entry.target.classList.add('anim-visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });

animTargets.forEach(function (el) { observer.observe(el); });

// Staggered delay for timeline items
document.querySelectorAll('.tl-item').forEach(function (el, i) {
  el.style.transitionDelay = (i * 0.1) + 's';
});

// Staggered delay for pricing cards
document.querySelectorAll('.pc-card').forEach(function (el, i) {
  el.classList.add('anim-hidden');
  el.style.transitionDelay = (i * 0.08) + 's';
  observer.observe(el);
});

// =====================
// HERO PARALLAX
// =====================
var heroVideo = document.querySelector('.hero-video');
if (heroVideo) {
  window.addEventListener('scroll', function () {
    var scrolled = window.scrollY;
    if (scrolled < window.innerHeight) {
      heroVideo.style.transform = 'translateY(' + (scrolled * 0.3) + 'px)';
    }
  }, { passive: true });
}
