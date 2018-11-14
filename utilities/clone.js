"use strict";

function clone(obj) {
    if (obj == null || typeof (obj) != 'object') {
        return obj;
    }

    var temp = new obj.constructor();

    for (var key in obj) {
        if (obj.hasOwnProperty(key)) {
            temp[key] = clone(obj[key]);
        }
    }

    return temp;
}
module.exports = clone;

