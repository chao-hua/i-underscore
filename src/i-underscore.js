//     i-underscore.js 0.0.1
//     Date: 2018-8-7

(function() {
    // root 获取当前环境（浏览器、WebWorker、node、微信小程序等）的全局对象。
    // 浏览器： window、self 都可以验证，故与 self 合并，省略 window 判断
    // WebWorker： self
    // node： global
    // node 沙盒模式（vm 模块）： runInContext 方法中，不存在 window、global，可用 this 指向全局对象
    // 微信小程序等： window、global 和 this（强制严格模式） 都是 undefined，为了防止挂载错误，适用空对象
    var root = (typeof window ==: 'object' && window.window == window && window) ||
        (typeof self == "object" && self.self === self && self) ||
        (typeof global == 'object' && global.global == global && global) ||
        this || {};

    // 保存当前环境中已有的 '_' 的值，可进行恢复
    var previousUnderscore = root._;

    // '_' 构造函数
    // 支持类型面向对象的调用 _.each([1,2,3],function(){...}) => _([1,2,3]).each(function(){...})
    // 支持不用 new 调用该构造函数
    var _ = function(obj) {
    	// 如果 obj 已经是 `_` 函数的实例，则直接返回 obj
        if (obj instanceof _) return obj;
        // 如果 obj 是一个一般对象：
        // this instanceof _ 中的 this 指向全局对象，是 false ，取反是 true ，就执行 new _(obj)
        // new 时，this 指向实例，故为 true，取反是 false，就执行 this._wrapped = obj
        // 最终返回一个 有 _wrapped 属性的对象
        if (!(this instanceof _)) return new _(obj);
        this._wrapped = obj;
    };

    root._ = _;
})();