// Delegated confirm() for any submit button with a data-confirm attribute.
// Using data-confirm (escaped normally by EJS's <%= %>) instead of building
// the confirm() string inline avoids breaking on names containing quotes.
document.addEventListener('submit', function (e) {
  var submitter = e.submitter;
  if (submitter && submitter.hasAttribute('data-confirm')) {
    if (!window.confirm(submitter.getAttribute('data-confirm'))) {
      e.preventDefault();
    }
  }
});
