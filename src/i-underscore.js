//     i-underscore.js 0.0.1
//     Date: 2018-8-7

// 通过立即执行函数，防止对全局变量进行污染。
(function() {
    // 创建 root，用于获取当前环境（浏览器、WebWorker、node服务端、虚拟机、微信小程序等）的全局对象。
    // 浏览器： window、self 都可以验证，故与 self 合并，省略 window 判断。
    // WebWorker： self。
    // node： global。
    // node 沙盒模式（vm 模块）： runInContext 方法中，不存在 window、global，可用 this 指向全局对象。
    // 微信小程序等： window、global 和 this（强制严格模式） 都是 undefined，为了防止挂载错误，适用空对象。
    var root = (typeof self == "object" && self.self === self && self) ||
        (typeof global == 'object' && global.global == global && global) ||
        this || {};

    // 保存当前环境中已有 _ 属性的值，用于恢复。
    var previousUnderscore = root._;

    // _ 构造函数。
    // 支持类型面向对象的调用 _.each([1,2,3],function(){...}) => _([1,2,3]).each(function(){...})。
    // 支持不用 new 调用该构造函数。
    var _ = function(obj) {
        // 如果 obj 已经是 `_` 函数的实例，则直接返回 obj。
        if (obj instanceof _) return obj;
        // 如果 obj 是一个一般对象：
        // this instanceof _ 中的 this 指向全局对象，是 false ，取反是 true ，就执行 new _(obj)。
        // new 时，this 指向实例，故为 true，取反是 false，就执行 this._wrapped = obj。
        // 最终返回一个 有 _wrapped 属性的对象。
        if (!(this instanceof _)) return new _(obj);
        this._wrapped = obj;
    };

    // 将 `_` 对象赋值给全局对象的兼容性写法。
    // 即客户端中 window._ = _。
    // 服务端(node)中 exports._ = _。
    // 同时在服务端向后兼容老的 require() API。
    if (typeof exports !== 'undefined') {
        if (typeof module !== 'undefined' && module.exports) {
            exports = module.exports = _;
        }
        exports._ = _;
    } else {
        root._ = _;
    }

    // 测试方法
    _.test = function() {
        console.log('test function')
    };

    // 函数判断
    _.isFunction = function(obj) {
        return typeof obj == 'function' || false;
    }

    // 返回传入对象的函数属性排序后的数组（包含继承的函数属性，不包含不可遍的属性）。
    _.functions = function(obj) {
        var names = [];
        // for...in 循环 包括: 自身的属性、继承的属性、可遍历属性;不包括: 不可遍历属性。
        for (var key in obj) {
            if (_.isFunction(obj[key])) names.push(key);
        }
        return names.sort();
    }


    // for _.mixin 
    var ArrayProto = Array.prototype;

    var push = ArrayProto.push;

    var MAX_ARRAY_INDEX = Math.pow(2, 53) - 1;

    var isArrayLike = function(collection) {
        var length = collection.length;
        return typeof length == 'number' && length >= 0 && length <= MAX_ARRAY_INDEX;
    };

    _.each = function(obj, callback) {
        var length, i = 0;

        if (isArrayLike(obj)) {
            length = obj.length;
            for (; i < length; i++) {
                if (callback.call(obj[i], obj[i], i) === false) {
                    break;
                }
            }
        } else {
            for (i in obj) {
                if (callback.call(obj[i], obj[i], i) === false) {
                    break;
                }
            }
        }

        return obj;
    }

    // 将传入对象的函数属性挂添加到 underscore 的原型上。
    _.mixin = function(obj) {
        // 将传入对象的函数属性依次处理。
        _.each(_.functions(obj), function(name) {
            // 函数绑定到 _ 上。
            var func = _[name] = obj[name];
            // 函数绑定到 _ 的原型上。
            _.prototype[name] = function() {
                // _wrapped 参数。
                var args = [this._wrapped];
                // 合并函数的参数。
                push.apply(args, arguments);
                // TODO
                return func.apply(_, args);
            };
        });
        return _;
    }

    // 将前面定义的 underscore 方法添加给包装过的对象，即添加到原型上。
    _.mixin(_);

    _.prototype.getWrapped = function() {
        return this._wrapped;
    };

})();