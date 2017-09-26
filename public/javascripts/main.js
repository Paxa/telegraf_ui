var $ = function (selector, element) {
  if (selector[0] == '<') {
    return $.element(selector, element);
  }
  return (element || document).querySelector(selector);
};

var $$ = function (selector, element) {
  return Array.from((element || document).querySelectorAll(selector));
};

$.element = function (html, attributes) {
  if (!attributes) attributes = {};
  var element;

  if (html[0] == '<') {
    var div = document.createElement('div');
    div.innerHTML = html;
    element = div.childNodes[0];
  } else {
    var element = document.createElement(html);
  }

  Object.keys(attributes).forEach(function (key) {
    var value = attributes[key];

    if (key == 'class') {
      element.className = value;
    } else if (key == 'classes') {
      value.forEach(function (className) {
        el.classList.add(className);
      });
    } else if (key == 'appendTo') {
      value.appendChild(element);
    } else if (key == 'html') {
      element.innerHTML = value;
    } else if (key == 'text') {
      element.innerText = value;
    } else if (key == 'hide') {
      element.style.display = 'none';
    } else {
      element.setAttribute(key, value);
    }
  });

  return element;
};

$.ready = function (fn) {
  if (document.readyState != 'loading') {
    fn();
  } else {
    document.addEventListener('DOMContentLoaded', fn);
  }
};

$.matches = function (el, selector) {
  var p = Element.prototype;
  var f = p.matches || p.webkitMatchesSelector || p.mozMatchesSelector || p.msMatchesSelector || function(s) {
    return [].indexOf.call(document.querySelectorAll(s), this) !== -1;
  };
  return f.call(el, selector);
};

$.closest = function (element, selector) {
  var parent = element;
  while (parent && !$.matches(parent, selector)) {
    parent = parent.parentNode;
    if (parent instanceof HTMLDocument) {
      return null;
    }
  }

  return parent;
};

function disableEmpty(form) {
  $$('input, select', form).forEach(function (el) {
    if (el.type != "submit" && el.value == "") {
      el.disabled = true;
    }
  });

  return true;
}
