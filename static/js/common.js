
'use strict';

function showError(text) {
    var $dom = $('.ui.error.message:not(.global)');
    if (!$dom.length) {
        $dom = $('.ui.global.error.message');
        if (!$dom.length) {
            alert(text);
            return;
        }
    }
    $dom.text(text);
    if (!$dom.is(':visible')) {
        $dom.transition('scale');
    } else {
        $dom.transition('pulse');
    }
}
