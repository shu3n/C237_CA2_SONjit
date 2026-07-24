// Delegated show/hide toggle for any .password-toggle button placed next
// to a password input via data-target="<input id>".
document.addEventListener('click', function (e) {
  var btn = e.target.closest('.password-toggle');
  if (!btn) return;

  var input = document.getElementById(btn.getAttribute('data-target'));
  if (!input) return;

  var willShow = input.type === 'password';
  input.type = willShow ? 'text' : 'password';
  btn.classList.toggle('is-visible', willShow);
  btn.setAttribute('aria-pressed', String(willShow));
  btn.setAttribute('aria-label', willShow ? 'Hide password' : 'Show password');
});
