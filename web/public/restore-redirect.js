(function () {
  try {
    var target = sessionStorage.redirect;
    if (target && target !== location.href) {
      delete sessionStorage.redirect;
      history.replaceState(null, '', target);
    }
  } catch (_) {}
})();
