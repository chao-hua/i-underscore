//     Underscore.js 1.9.1
//     http://underscorejs.org
//     (c) 2009-2018 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
//     Underscore may be freely distributed under the MIT license.
//     中文注释：华超（chaohua@outlook.com）

// 通过立即执行函数，防止对全局变量进行污染。
(function() {

  // Baseline setup
  // 基础设置
  // --------------

  // Establish the root object, `window` (`self`) in the browser, `global`
  // on the server, or `this` in some virtual machines. We use `self`
  // instead of `window` for `WebWorker` support.
  // 创建 root，用于获取当前环境（浏览器、WebWorker、node服务端、虚拟机、微信小程序等）的全局对象。
  // 浏览器： window、self 都可以验证，故与 self 合并，省略 window 判断。
  // WebWorker： self。
  // node： global。
  // node 沙盒模式（vm 模块）： runInContext 方法中，不存在 window、global，可用 this 指向全局对象。
  // 微信小程序等： window、global 和 this（强制严格模式） 都是 undefined，为了防止挂载错误，适用空对象。
  var root = typeof self == 'object' && self.self === self && self ||
            typeof global == 'object' && global.global === global && global ||
            this ||
            {};

  // Save the previous value of the `_` variable.
  // 保存当前环境中已有 '_' 属性的值，用于恢复。
  var previousUnderscore = root._;

  // Save bytes in the minified (but not gzipped) version:
  // 缓存变量, 便于压缩代码（非 gzip 压缩）。
  var ArrayProto = Array.prototype, ObjProto = Object.prototype;
  var SymbolProto = typeof Symbol !== 'undefined' ? Symbol.prototype : null;

  // Create quick reference variables for speed access to core prototypes.
  // 缓存变量, 便于压缩代码。
  // 同时可减少在原型链中的查找次数(提高代码效率)。
  var push = ArrayProto.push,
      slice = ArrayProto.slice,
      toString = ObjProto.toString,
      hasOwnProperty = ObjProto.hasOwnProperty;

  // All **ECMAScript 5** native function implementations that we hope to use
  // are declared here.
  // ES5 原生方法, 如果浏览器支持, 则 underscore 中会优先使用
  var nativeIsArray = Array.isArray,
      nativeKeys = Object.keys,
      nativeCreate = Object.create;

  // Naked function reference for surrogate-prototype-swapping.
  // constructor 的缩写，这个空的构造函数用于对象创建。避免每次调用 baseCreate 都要创建空的构造函数。
  var Ctor = function(){};

  // Create a safe reference to the Underscore object for use below.
  // '_' 构造函数。
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

  // Export the Underscore object for **Node.js**, with
  // backwards-compatibility for their old module API. If we're in
  // the browser, add `_` as a global object.
  // (`nodeType` is checked to ensure that `module`
  // and `exports` are not HTML elements.)
  // 将 `_` 对象赋值给全局对象的兼容性写法。
  // 即客户端中 window._ = _。
  // 服务端(node)中 exports._ = _。
  // 同时在服务端向后兼容老的 require() API。
  // exports.nodeType 判断，主要是防止 HTML 中 id 为 exports 的元素，就会生成一个 window.exports 全局变量。
  if (typeof exports != 'undefined' && !exports.nodeType) {
    if (typeof module != 'undefined' && !module.nodeType && module.exports) {
      exports = module.exports = _;
    }
    exports._ = _;
  } else {
    root._ = _;
  }

  // Current version.
  // 当前 underscore 版本号。
  _.VERSION = '1.9.1';

  // Internal function that returns an efficient (for current engines) version
  // of the passed-in callback, to be repeatedly applied in other Underscore
  // functions.
  // 对回调函数的优化。
  var optimizeCb = function(func, context, argCount) {
    // 如果没有传入 context，就返回 func 函数。
    // void 0 会返回纯正的 undefined，这样做避免 undefined 已经被污染带来的判定失效。
    if (context === void 0) return func;
    // 根据参数个数，分别处理。
    // 比直接使用 func.apply(context, arguments) 好处：1.call 比 apply 性能更高；2.避免使用 arguments，提高性能。
    switch (argCount == null ? 3 : argCount) {
      // 1个参数的情况，只需要值，例如 times 函数。
      case 1: return function(value) {
        return func.call(context, value);
      };
      // 2个参数的情况，没用被用到，所以在新版中被删除了。
      // The 2-argument case is omitted because we’re not using it.
      // 3个参数的情况，值、索引、被迭代的对象，用于一些迭代器函数，例如 map 函数等。
      case 3: return function(value, index, collection) {
        return func.call(context, value, index, collection);
      };
      // 4个参数的情况，累加器、值、索引、被迭代的对象，用于 reduce 和 reduceRight 函数。
      case 4: return function(accumulator, value, index, collection) {
        return func.call(context, accumulator, value, index, collection);
      };
    }
    // 其他情况。
    return function() {
      return func.apply(context, arguments);
    };
  };

  var builtinIteratee;

  // An internal function to generate callbacks that can be applied to each
  // element in a collection, returning the desired result — either `identity`,
  // an arbitrary callback, a property matcher, or a property accessor.
  // 对回调操作（不仅是函数）的分类处理。
  var cb = function(value, context, argCount) {
    // 判断是否使用默认迭代器，如果外部改写了 _.iteratee，则按照自定义的函数进行处理。
    if (_.iteratee !== builtinIteratee) return _.iteratee(value, context);
    // 没有处理操作时，直接返回未被处理的数据本身。
    if (value == null) return _.identity;
    // 处理操作是函数时，通过 optimizeCb 优化处理函数。
    if (_.isFunction(value)) return optimizeCb(value, context, argCount);
    // 处理操作是对象类型时，通过 _.matcher 来进行对象匹配。
    if (_.isObject(value) && !_.isArray(value)) return _.matcher(value);
    // 处理操作是基本类型的值时，返回对应的属性值。
    return _.property(value);
  };

  // External wrapper for our callback generator. Users may customize
  // `_.iteratee` if they want additional predicate/iteratee shorthand styles.
  // This abstraction hides the internal-only argCount argument.
  // 默认迭代器，保存 cb 的引用，用于判断是否改写了默认的迭代器。
  _.iteratee = builtinIteratee = function(value, context) {
    return cb(value, context, Infinity);
  };

  // Some functions take a variable number of arguments, or a few expected
  // arguments at the beginning and then a variable number of values to operate
  // on. This helper accumulates all remaining arguments past the function’s
  // argument length (or an explicit `startIndex`), into an array that becomes
  // the last argument. Similar to ES6’s "rest parameter".
  // 在 ES5 中 实现了 ES6 的 rest parameter，即实现松散参数，使部分方法调用更灵活。
  var restArguments = function(func, startIndex) {
    // 函数的 length 属性是函数的形参个数，即定义函数时的参数个数。
    // 函数的 arguments.length 是函数的实参个数，即调用函数时真正传入的参数个数。
    startIndex = startIndex == null ? func.length - 1 : +startIndex;
    // 返回一个支持 rest 参数的函数。
    return function() {
      // 保证参数为正。
      var length = Math.max(arguments.length - startIndex, 0),
          rest = Array(length),
          index = 0;
      // 获得 rest 参数数组，例 rest = [3, 4, 5]。
      for (; index < length; index++) {
        rest[index] = arguments[index + startIndex];
      }
      // 根据rest参数不同, 分情况调用函数, 提高性能（apply => call）。
      switch (startIndex) {
        case 0: return func.call(this, rest);
        case 1: return func.call(this, arguments[0], rest);
        case 2: return func.call(this, arguments[0], arguments[1], rest);
      }
      // 更多参数的情况，使用 apply。
      // 组合最终的参数集合,例 args = [1, 2, undefined]。
      var args = Array(startIndex + 1);
      for (index = 0; index < startIndex; index++) {
        args[index] = arguments[index];
      }
      // 例 args = [1, 2, [3, 4, 5]]。
      args[startIndex] = rest;
      return func.apply(this, args);
    };
  };

  // An internal function for creating a new object that inherits from another.
  // 根据已知的对象 prototype，返回一个继承的子对象。
  var baseCreate = function(prototype) {
    if (!_.isObject(prototype)) return {};
    // 若存在 ES5 的 Object.create 就是会用该方法。
    if (nativeCreate) return nativeCreate(prototype);
    // 不存在，就简易实现 create 内部逻辑（不支持属性列表）。
    Ctor.prototype = prototype;
    // new 命令本身就可以执行构造函数，构造函数带不带括号一样，但更推荐加上括号。
    var result = new Ctor;
    // 还原Ctor原型，防止内存泄漏。
    Ctor.prototype = null;
    return result;
  };

  // 根据属性名，返回获取对象的属性的函数（非常灵活）。
  // 例： var getName = shallowProperty('name');
  //      var name =  getName(obj);
  var shallowProperty = function(key) {
    return function(obj) {
      return obj == null ? void 0 : obj[key];
    };
  };

  // 根据属性名，判断对象本身是否存在该属性（去除继承属性）。
  var has = function(obj, path) {
    return obj != null && hasOwnProperty.call(obj, path);
  }

  // 根据 path 数组，深度获取 obj 中对应的值。
  var deepGet = function(obj, path) {
    var length = path.length;
    for (var i = 0; i < length; i++) {
      if (obj == null) return void 0;
      obj = obj[path[i]];
    }
    return length ? obj : void 0;
  };

  // Helper for collection methods to determine whether a collection
  // should be iterated as an array or as an object.
  // Related: http://people.mozilla.org/~jorendorff/es6-draft.html#sec-tolength
  // Avoids a very nasty iOS 8 JIT bug on ARM-64. #2094
  // 最大数组长度, 避免 IOS 8 出现 bug。
  var MAX_ARRAY_INDEX = Math.pow(2, 53) - 1;
  // 获取对象 length 属性的值。
  var getLength = shallowProperty('length');
  // 判断集合是否是近似数组的（含有符合条件的 length 属性）。
  var isArrayLike = function(collection) {
    var length = getLength(collection);
    return typeof length == 'number' && length >= 0 && length <= MAX_ARRAY_INDEX;
  };

  // Collection Functions
  // 集合方法（25个）
  // --------------------

  // The cornerstone, an `each` implementation, aka `forEach`.
  // Handles raw objects in addition to array-likes. Treats all
  // sparse array-likes as if they were dense.
  // 遍历集合中每一个元素，进行相应回调操作，返回原集合。
  // 与 ES5 中 Array.prototype.forEach 使用方法类似。
  _.each = _.forEach = function(obj, iteratee, context) {
    // 优化回调函数。
    iteratee = optimizeCb(iteratee, context);
    var i, length;
    // 区分类数组与对象。
    if (isArrayLike(obj)) {
      for (i = 0, length = obj.length; i < length; i++) {
        iteratee(obj[i], i, obj);
      }
    } else {
      var keys = _.keys(obj);
      for (i = 0, length = keys.length; i < length; i++) {
        iteratee(obj[keys[i]], keys[i], obj);
      }
    }
    // 返回对象自身, 以便进行链式构造。
    return obj;
  };

  // Return the results of applying the iteratee to each element.
  // 遍历集合中每一个元素，进行相应回调操作，将结果保存到新的数组中，并返回。
  // 与 ES5 中 Array.prototype.map 使用方法类似。
  _.map = _.collect = function(obj, iteratee, context) {
    // 优化回调操作。
    iteratee = cb(iteratee, context);
    // 兼容类数组和对象的写法。
    var keys = !isArrayLike(obj) && _.keys(obj),
        length = (keys || obj).length,
        results = Array(length);
    for (var index = 0; index < length; index++) {
      var currentKey = keys ? keys[index] : index;
      results[index] = iteratee(obj[currentKey], currentKey, obj);
    }
    // 返回回调操作处理后的新数组。
    return results;
  };

  // Create a reducing function iterating left or right.
  // reduce 函数的工厂函数，用于生成一个 reducer，通过 dir（1：正序；-1：倒序）决定 reduce 的方向。
  var createReduce = function(dir) {
    // Wrap code that reassigns argument variables in a separate function than
    // the one that accesses `arguments.length` to avoid a perf hit. (#1991)
    var reducer = function(obj, iteratee, memo, initial) {
      var keys = !isArrayLike(obj) && _.keys(obj),
          length = (keys || obj).length,
          index = dir > 0 ? 0 : length - 1;
      // 没有初始化 memo，默认位第首个元素（reduce：第一个元素；reduceRight：最后一个元素）。
      if (!initial) {
        memo = obj[keys ? keys[index] : index];
        index += dir;
      }
      for (; index >= 0 && index < length; index += dir) {
        var currentKey = keys ? keys[index] : index;
        // 执行回调操作，每次刷新当前的值。
        memo = iteratee(memo, obj[currentKey], currentKey, obj);
      }
      // 返回最终结果。
      return memo;
    };

    return function(obj, iteratee, memo, context) {
      // 判断是否初始化 memo（累计的初始值）。
      var initial = arguments.length >= 3;
      // optimizeCb( , , 4) 对应就是 reduce 的回调优化。
      return reducer(obj, optimizeCb(iteratee, context, 4), memo, initial);
    };
  };

  // **Reduce** builds up a single result from a list of values, aka `inject`,
  // or `foldl`.
  // 正序（从左往右）规约。
  // 与 ES5 中 Array.prototype.reduce 使用方法类似。
  _.reduce = _.foldl = _.inject = createReduce(1);

  // The right-associative version of reduce, also known as `foldr`.
  // 倒序（从右往左）规约。
  // 与 ES5 中 Array.prototype.reduceRight 使用方法类似。
  _.reduceRight = _.foldr = createReduce(-1);

  // Return the first value which passes a truth test. Aliased as `detect`.
  // 返回集合中第一个满足条件（predicate 函数返回 true）的元素。
  // 与 ES6 中 Array.prototype.find 使用方法类似。
  _.find = _.detect = function(obj, predicate, context) {
    var keyFinder = isArrayLike(obj) ? _.findIndex : _.findKey;
    var key = keyFinder(obj, predicate, context);
    if (key !== void 0 && key !== -1) return obj[key];
  };

  // Return all the elements that pass a truth test.
  // Aliased as `select`.
  // 返回集合中所有满足条件的元素的数组。
  // 与 ES5 中 Array.prototype.filter 使用方法类似。
  _.filter = _.select = function(obj, predicate, context) {
    var results = [];
    predicate = cb(predicate, context);
    _.each(obj, function(value, index, list) {
      if (predicate(value, index, list)) results.push(value);
    });
    return results;
  };

  // Return all the elements for which a truth test fails.
  // 返回集合中所有不满足条件元素的数组。
  // 是 _.filter 方法的补集。
  _.reject = function(obj, predicate, context) {
    return _.filter(obj, _.negate(cb(predicate)), context);
  };

  // Determine whether all of the elements match a truth test.
  // Aliased as `all`.
  // 判断集合中的每一个元素，是否都满足判断条件。全部满足，返回 true；一个不满足，返回 false;
  // 与 ES5 中的 Array.prototype.every 方法类似。
  _.every = _.all = function(obj, predicate, context) {
    predicate = cb(predicate, context);
    var keys = !isArrayLike(obj) && _.keys(obj),
        length = (keys || obj).length;
    for (var index = 0; index < length; index++) {
      var currentKey = keys ? keys[index] : index;
      // 如果有一个不满足 predicate 中的条件，返回 false;
      if (!predicate(obj[currentKey], currentKey, obj)) return false;
    }
    return true;
  };

  // Determine if at least one element in the object matches a truth test.
  // Aliased as `any`.
  // 判断集合中的是否有一个满足判断条件。有一个或以上满足，返回 true；全部不满足，返回 false;
  // 与 ES5 中 Array.prototype.some 方法类似。
  _.some = _.any = function(obj, predicate, context) {
    predicate = cb(predicate, context);
    var keys = !isArrayLike(obj) && _.keys(obj),
        length = (keys || obj).length;
    for (var index = 0; index < length; index++) {
      var currentKey = keys ? keys[index] : index;
      // 如果有一个满足 predicate 中的条件，返回 true;
      if (predicate(obj[currentKey], currentKey, obj)) return true;
    }
    return false;
  };

  // Determine if the array or object contains a given item (using `===`).
  // Aliased as `includes` and `include`.
  // 检测一个集合是否包含一个指定的元素。
  // 与 ES6 中 Array.prototype.includes 方法类似。
  _.contains = _.includes = _.include = function(obj, item, fromIndex, guard) {
    if (!isArrayLike(obj)) obj = _.values(obj);
    if (typeof fromIndex != 'number' || guard) fromIndex = 0;
    return _.indexOf(obj, item, fromIndex) >= 0;
  };

  // Invoke a method (with arguments) on every item in a collection.
  // 迭代集合，深度遍历集合中每一个元素，进行相应回调操作。
  _.invoke = restArguments(function(obj, path, args) {
    var contextPath, func;
    if (_.isFunction(path)) {
      func = path;
    } else if (_.isArray(path)) {
      contextPath = path.slice(0, -1);
      path = path[path.length - 1];
    }
    return _.map(obj, function(context) {
      var method = func;
      if (!method) {
        if (contextPath && contextPath.length) {
          context = deepGet(context, contextPath);
        }
        if (context == null) return void 0;
        method = context[path];
      }
      return method == null ? method : method.apply(context, args);
    });
  });

  // Convenience version of a common use case of `map`: fetching a property.
  // 获取集合中对应属性（key）的值的数组。
  _.pluck = function(obj, key) {
    return _.map(obj, _.property(key));
  };

  // Convenience version of a common use case of `filter`: selecting only objects
  // containing specific `key:value` pairs.
  // 获取集合中满足条件（attrs：对象形式，键值对）元素的数组。
  _.where = function(obj, attrs) {
    return _.filter(obj, _.matcher(attrs));
  };

  // Convenience version of a common use case of `find`: getting the first object
  // containing specific `key:value` pairs.
  // 获取集合中满足条件（attrs：对象形式，键值对）的第一个元素。
  _.findWhere = function(obj, attrs) {
    return _.find(obj, _.matcher(attrs));
  };

  // Return the maximum element (or element-based computation).
  // 获得集合中最大值（仅数值比较，即Number() 非 NaN 结果的值）。
  _.max = function(obj, iteratee, context) {
    var result = -Infinity, lastComputed = -Infinity,
        value, computed;
    // 无 iteratee 回调操作 或 者回调是数字类型、比较似数组形式对象（数字键值，没有 length 属性的对象）时，直接比较值。
    if (iteratee == null || typeof iteratee == 'number' && typeof obj[0] != 'object' && obj != null) {
      obj = isArrayLike(obj) ? obj : _.values(obj);
      for (var i = 0, length = obj.length; i < length; i++) {
        value = obj[i];
        // 确保仅比较数值（Number() 非 NaN 结果的值）。
        if (value != null && value > result) {
          result = value;
        }
      }
    } else {
      // 有 iteratee 参数，则每个元素经过回调操作处理后的值，进行比较。
      iteratee = cb(iteratee, context);
      _.each(obj, function(v, index, list) {
        computed = iteratee(v, index, list);
        // && 的优先级高于 ||。
        if (computed > lastComputed || computed === -Infinity && result === -Infinity) {
          result = v;
          lastComputed = computed;
        }
      });
    }
    return result;
  };

  // Return the minimum element (or element-based computation).
  // 获得集合中最小值（仅数值比较，即Number() 非 NaN 结果的值）。
  _.min = function(obj, iteratee, context) {
    var result = Infinity, lastComputed = Infinity,
        value, computed;
    if (iteratee == null || typeof iteratee == 'number' && typeof obj[0] != 'object' && obj != null) {
      obj = isArrayLike(obj) ? obj : _.values(obj);
      for (var i = 0, length = obj.length; i < length; i++) {
        value = obj[i];
        if (value != null && value < result) {
          result = value;
        }
      }
    } else {
      iteratee = cb(iteratee, context);
      _.each(obj, function(v, index, list) {
        computed = iteratee(v, index, list);
        if (computed < lastComputed || computed === Infinity && result === Infinity) {
          result = v;
          lastComputed = computed;
        }
      });
    }
    return result;
  };

  // Shuffle a collection.
  // 返回随机乱序的几个副本。
  _.shuffle = function(obj) {
    return _.sample(obj, Infinity);
  };

  // Sample **n** random values from a collection using the modern version of the
  // [Fisher-Yates shuffle](http://en.wikipedia.org/wiki/Fisher–Yates_shuffle).
  // If **n** is not specified, returns a single random element.
  // The internal `guard` argument allows it to work with `map`.
  // 随机返回数组 或 集合中的一个元素（没有参数 n 时）。
  _.sample = function(obj, n, guard) {
    // 随机返回一个元素。
    if (n == null || guard) {
      if (!isArrayLike(obj)) obj = _.values(obj);
      return obj[_.random(obj.length - 1)];
    }
    var sample = isArrayLike(obj) ? _.clone(obj) : _.values(obj);
    var length = getLength(sample);
    // 保证 0<= n <= lenght。
    n = Math.max(Math.min(n, length), 0);
    var last = length - 1;
    // 到 n 截止。
    for (var index = 0; index < n; index++) {
      // 交换位置。
      var rand = _.random(index, last);
      var temp = sample[index];
      sample[index] = sample[rand];
      sample[rand] = temp;
    }
    // 返回 n 长度的数组。
    return sample.slice(0, n);
  };

  // Sort the object's values by a criterion produced by an iteratee.
  // 对象集合的排序，根据某个属性排序，类似 sql 语句中的排序。
  // 与 ES5 中 Array.prototype.sort 使用方法类似。
  _.sortBy = function(obj, iteratee, context) {
    var index = 0;
    iteratee = cb(iteratee, context);
    // 先通过 _.map 生成新的对象合集。
    // var iteratee = function(value, key, index, elem) { return elem.x; }
    // [{x:1},{x:2}] => [{value:{x:1},index:0,criteria:1},{value:{x:1},index:0,criteria:1}]
    // 再排序 .sort。
    // 最后 通过 _.pluck([], 'value') 将排好序的对象取出来。
    return _.pluck(_.map(obj, function(value, key, list) {
      return {
        value: value,
        index: index++,
        criteria: iteratee(value, key, list)
      };
    }).sort(function(left, right) {
      var a = left.criteria;
      var b = right.criteria;
      if (a !== b) {
        if (a > b || a === void 0) return 1;
        if (a < b || b === void 0) return -1;
      }
      return left.index - right.index;
    }), 'value');
  };

  // An internal function used for aggregate "group by" operations.
  // 根据特定规则，返回分组函数。
  var group = function(behavior, partition) {
    return function(obj, iteratee, context) {
      // partition 是否是进行划分，即是否是将一个集合一分为二。
      var result = partition ? [[], []] : {};
      iteratee = cb(iteratee, context);
      _.each(obj, function(value, index) {
        var key = iteratee(value, index, obj);
        behavior(result, value, key);
      });
      return result;
    };
  };

  // Groups the object's values by a criterion. Pass either a string attribute
  // to group by, or a function that returns the criterion.
  // 根据 iteratee 为分组依据，对集合进行分组。
  // 类似 sql 中的 group by 关键字。
  // _.groupBy(['one', 'two', 'three'], 'length'); => {3: ["one", "two"], 5: ["three"]}
  _.groupBy = group(function(result, value, key) {
    // 如果已经存在 key 的分组，将符合分组的 value 加入该分组。
    // 如果不存在，创建该分组，并将 value 放入其中。
    if (has(result, key)) result[key].push(value); else result[key] = [value];
  });

  // Indexes the object's values by a criterion, similar to `groupBy`, but for
  // when you know that your index values will be unique.
  // 根据 iteratee，给集合分配索引，返回索引集合。
  // _.indexBy([{name: 'moe', age: 80}, {name: 'larry', age: 50}, {name: 'curly', age: 60}], 'age');
  // => {50 : {name: "larry", age: 50}, 60 : {name: "curly", age: 60}, 80 : {name: "moe", age: 80}}
  _.indexBy = group(function(result, value, key) {
    // 每个索引都是一个分组。
    result[key] = value;
  });

  // Counts instances of an object that group by a certain criterion. Pass
  // either a string attribute to count by, or a function that returns the
  // criterion.
  // 根据 iteratee 为分组依据，统计集合各个分组的元素个数。
  // _.countBy(['one', 'two', 'three'], 'length'); => {3: 2, 5: 1}
  _.countBy = group(function(result, value, key) {
    // 如果已经存在 key 的分组，该分组统计个数 +1 。
    // 如果不存在，创建该分组，分配个数 1。
    if (has(result, key)) result[key]++; else result[key] = 1;
  });

  // 重要正则。
  // TODO：未理解
  // [^\ud800-\udfff]: 表示不包含代理对代码点的所有字符。
  // [\ud800-\udbff][\udc00-\udfff]: 表示合法的代理对的所有字符。
  // [\ud800-\udfff]: 表示代理对的代码点（本身不是合法的Unicode字符）。
  // 参考文献:
  // [字符编码的那些事](http://licstar.net/archives/tag/utf-8)
  // [知乎关于underscore这个正则的提问](https://www.zhihu.com/question/38324041)
  var reStrSymbol = /[^\ud800-\udfff]|[\ud800-\udbff][\udc00-\udfff]|[\ud800-\udfff]/g;
  // Safely create a real, live array from anything iterable.
  // 将伪数组转化成数组。
  _.toArray = function(obj) {
    if (!obj) return [];
    // 数组时，返回该数组副本。
    // TODO：obj.concat() 更方便？
    if (_.isArray(obj)) return slice.call(obj);
    // 字符串时，特殊处理。
    if (_.isString(obj)) {
      // Keep surrogate pair characters together
      // match每一个字符到数组中, 通过reStrSymbol保证了:
      // 1. 不含代理对代码点的所有字符
      // 2. 合法代理对的所有字符
      // 3. 代理对代码点的字符
      // 都能match的数组。
      return obj.match(reStrSymbol);
    }
    // 类数组时，利用 -.map 重新构造数组。
    if (isArrayLike(obj)) return _.map(obj, _.identity);
    // 对象是，返回值得数组。
    return _.values(obj);
  };

  // Return the number of elements in an object.
  // 返回集合长度。
  _.size = function(obj) {
    if (obj == null) return 0;
    return isArrayLike(obj) ? obj.length : _.keys(obj).length;
  };

  // Split a collection into two arrays: one whose elements all satisfy the given
  // predicate, and one whose elements all do not satisfy the predicate.
  // 根据 iteratee 为分组依据，对集合划分成两个数组。
  // _.partition([0, 1, 2, 3, 4, 5], function(num){ return num % 2 !== 0; }); => [[1, 3, 5], [0, 2, 4]]
  _.partition = group(function(result, value, pass) {
    result[pass ? 0 : 1].push(value);
  }, true);

  // Array Functions
  // 数组方法（21个）
  // ---------------

  // Get the first element of an array. Passing **n** will return the first N
  // values in the array. Aliased as `head` and `take`. The **guard** check
  // allows it to work with `_.map`.
  // 返回数组第一个元素，或者返回指定长度的前 n 个元素组成的数组。
  _.first = _.head = _.take = function(array, n, guard) {
    // 容错。
    if (array == null || array.length < 1) return n == null ? void 0 : [];
    // 未指定 n，返回数组的第一个元素。
    if (n == null || guard) return array[0];
    // 指定 n，返回数组的前 n 个元素组成的数组。
    return _.initial(array, array.length - n);
  };

  // Returns everything but the last entry of the array. Especially useful on
  // the arguments object. Passing **n** will return all the values in
  // the array, excluding the last N.
  // 获得 array 的除了最后 n 个元素以外的元素组成的数组，n 默认为 1。
  _.initial = function(array, n, guard) {
    return slice.call(array, 0, Math.max(0, array.length - (n == null || guard ? 1 : n)));
  };

  // Get the last element of an array. Passing **n** will return the last N
  // values in the array.
  // 返回数组最后一个元素，或者返回指定长度的后 n 个元素组成的数组。
  _.last = function(array, n, guard) {
    if (array == null || array.length < 1) return n == null ? void 0 : [];
    if (n == null || guard) return array[array.length - 1];
    return _.rest(array, Math.max(0, array.length - n));
  };

  // Returns everything but the first entry of the array. Aliased as `tail` and `drop`.
  // Especially useful on the arguments object. Passing an **n** will return
  // the rest N values in the array.
  // 获得 array 的除了最前 n 个元素以外的元素组成的数组，n 默认为 1。
  _.rest = _.tail = _.drop = function(array, n, guard) {
    return slice.call(array, n == null || guard ? 1 : n);
  };

  // Trim out all falsy values from an array.
  // 返回一个全部为 true（Boolean() 的结果为 true）的数组。
  // Boolean() 为 false：false、null、undefined、''、NaN、0。
  _.compact = function(array) {
    return _.filter(array, Boolean);
  };

  // Internal implementation of a recursive `flatten` function.
  // 根据条件展平数组（类数组）。
  var flatten = function(input, shallow, strict, output) {
    // shallow：是否浅展开，true：浅展开；false：深度展开，没传就表示深度展开。
    // strict：严格模式, true：严格，input 只能是数组（类数组）；false：非严格，没传就表示非严格。
    output = output || [];
    var idx = output.length;
    for (var i = 0, length = getLength(input); i < length; i++) {
      var value = input[i];
      if (isArrayLike(value) && (_.isArray(value) || _.isArguments(value))) {
        // Flatten current level of array or arguments object.
        // 浅展开。
        if (shallow) {
          var j = 0, len = value.length;
          while (j < len) output[idx++] = value[j++];
        } else {
          // 深度展开，递归。
          flatten(value, shallow, strict, output);
          idx = output.length;
        }
      } else if (!strict) {
        // 非严格，value 不数组等，也可以返回。
        // strict 是和 shallow 配合使用的。
        // shallow = false，strict = true，即深度展开，严格模式，深度展开最终的 value 必定不是数组，又是严格模式，最终只能返回 []。
        // flatten( [1, [2], [3, [[4]]]], false, false); => [1, 2, 3, 4]：默认情况，深度、非严格展开。
        // flatten( [1, [2], [3, [[4]]]], false, true); => []：深度、严格，有问题，几乎不用。
        // flatten( [1, [2], [3, [[4]]]], true, false); => [1, 2, 3, [4]]：浅度、非严格，只展开一层数组。
        // flatten( [1, [2], [3, [[4]]]], true, true); => [2, 3, [4]]：浅度、严格，常用于浅度合并几个数组，_.union。
        output[idx++] = value;
      }
    }
    return output;
  };

  // Flatten out an array, either recursively (by default), or just one level.
  // 展平数组。根据 shallow，深度（默认）、浅度展开。
  _.flatten = function(array, shallow) {
    return flatten(array, shallow, false);
  };

  // Return a version of the array that does not contain the specified value(s).
  // 返回移除指定多个元素后的数组。
  // _.without([1, 2, 1, 0, 3, 1, 4], 0, 1); => [2, 3, 4]。
  _.without = restArguments(function(array, otherArrays) {
    // 通过 restArguments 函数，将 rest 参数，已经转化成一个数组，即：_.difference([1, 2, 1, 0, 3, 1, 4], [0, 1])。
    // 在 1.8.3 版本中，没有 restArguments 函数，代码是： _.difference(array, slice.call(arguments, 1)); 更直观。
    return _.difference(array, otherArrays);
  });

  // Produce a duplicate-free version of the array. If the array has already
  // been sorted, you have the option of using a faster algorithm.
  // The faster algorithm will not work with an iteratee if the iteratee
  // is not a one-to-one function, so providing an iteratee will disable
  // the faster algorithm.
  // Aliased as `unique`.
  // 数组去重。
  _.uniq = _.unique = function(array, isSorted, iteratee, context) {
    // isSorted：传入的数组是否已排序，已排序会加快效率。
    // 第二个参数不是 boolean ，即理解为是比较函数, 且默认是没有排序的数组，=> _.unique(array, iteratee, context) isSorted = false。
    if (!_.isBoolean(isSorted)) {
      context = iteratee;
      iteratee = isSorted;
      isSorted = false;
    }
    // 回调操作/比较操作 优化。
    if (iteratee != null) iteratee = cb(iteratee, context);
    var result = [];
    var seen = [];
    for (var i = 0, length = getLength(array); i < length; i++) {
      var value = array[i],
          computed = iteratee ? iteratee(value, i, array) : value;
      // 如果是有序数组 且 没有回调操作/比较操作过值，直接用 !== 比较。
      if (isSorted && !iteratee) {
        // 如果 i === 0，是第一个元素，则直接 push。
        // 否则比较当前元素是否和前一个元素是否相等，有序数组才可以这样比较。
        if (!i || seen !== computed) result.push(value);
        // seen 保存当前元素，供下一次对比。
        seen = computed;
      } else if (iteratee) {
        // 非排序数组，且存在回调操作/比较操作，需要根据 computed 来进行比较，而不是直接使用 value。
        if (!_.contains(seen, computed)) {
          seen.push(computed);
          result.push(value);
        }
      } else if (!_.contains(result, value)) {
        // 其他情况，直接通过 _.contains 进行判断。
        result.push(value);
      }
    }
    return result;
  };

  // Produce an array that contains the union: each distinct element from all of
  // the passed-in arrays.
  // 合并多个数组，即获得多个数组的并集，并去重。
  _.union = restArguments(function(arrays) {
    // 首先展开数组（浅、严格）：_.union([1, 2, 3], [101, [2, 1], 10], [2,3]) => [1,2,3,101,[2,1],10,2,3]。
    // 再去重：=> [1,2,3,101,[2,1],10]。
    return _.uniq(flatten(arrays, true, true));
  });

  // Produce an array that contains every item shared between all the
  // passed-in arrays.
  // 获得多个数组的交集。
  _.intersection = function(array) {
    var result = [];
    var argsLength = arguments.length;
    // 遍历第一个数组，与后面所有数组元素进行对比。
    for (var i = 0, length = getLength(array); i < length; i++) {
      var item = array[i];
      // 结果数组已经包含了该元素, 跳过此次遍历。
      if (_.contains(result, item)) continue;
      var j;
      // 遍历的除去第一个数值之外的数组（j 从 1 开始）。
      for (j = 1; j < argsLength; j++) {
        // 如果在某一个数组中不存在，即不是交集成员，跳出，进行下次循环。
        if (!_.contains(arguments[j], item)) break;
      }
      // 如果遍历完成，依然没有跳出，说明每个数组中都存在这个元素，加入结果集。
      if (j === argsLength) result.push(item);
    }
    return result;
  };

  // Take the difference between one array and a number of other arrays.
  // Only the elements present in just the first array will remain.
  // 获取对象数组与多个数组之间的差集，即第一个数组有，其他多个数组都没有的元素的集合。
  _.difference = restArguments(function(array, rest) {
    // 先将除了首个数组之外的数组全部展开（浅、严格）。
    rest = flatten(rest, true, true);
    // 遍历 array, 过滤掉 array 中的存在于 rest 数组中元素。
    return _.filter(array, function(value){
      return !_.contains(rest, value);
    });
  });

  // Complement of _.zip. Unzip accepts an array of arrays and groups
  // each array's elements on shared indices.
  // 将多个成员数组，从对应的位置抽出元素，组成新的分组，合并这些分组成数组。
  // _.unzip([['moe', 'larry', 'curly', 'hc'], [30, 40, 50], [true, false, false]])
  // => [["moe", 30, true], ["larry", 40, false], ["curly", 50, false], ['hc', undefined, undefined]]
  // _.unzip([["moe", 30, true], ["larry", 40, false], ["curly", 50, false]]);
  // => [['moe', 'larry', 'curly'], [30, 40, 50], [true, false, false]]
  _.unzip = function(array) {
    // 获得 array 的成员数组中最大的长度。
    var length = array && _.max(array, getLength).length || 0;
    var result = Array(length);

    for (var index = 0; index < length; index++) {
      // 从 array 中获得所有 index 对应元素的数组，放入 result 对应的位置。
      result[index] = _.pluck(array, index);
    }
    return result;
  };

  // Zip together multiple lists into a single array -- elements that share
  // an index go together.
  // 压缩数组。将多个数组，从对应的位置抽出元素，组成新的分组，合并这些分组成数组。
  // 与 _.unzip，只是传入参数是多个数组， _.unzip 是单个数组。
  // 1.8.3 中代码是：_.zip = function(){ return _.unzip(arguments);}
  // _.zip(['moe', 'larry', 'curly', 'hc'], [30, 40, 50], [true, false, false])
  // => [["moe", 30, true], ["larry", 40, false], ["curly", 50, false], ['hc', undefined, undefined]]
  // _.zip(["moe", 30, true], ["larry", 40, false], ["curly", 50, false]);
  // => [['moe', 'larry', 'curly'], [30, 40, 50], [true, false, false]]
  _.zip = restArguments(_.unzip);

  // Converts lists into objects. Pass either a single array of `[key, value]`
  // pairs, or two parallel arrays of the same length -- one of keys, and one of
  // the corresponding values. Passing by pairs is the reverse of _.pairs.
  // 将数组转化成对象。
  // 参数是两个数组，两个数组对应，组成键值对：
  // _.object(['moe', 'larry', 'curly'], [30, 40, 50]); => {moe: 30, larry: 40, curly: 50}
  // 参数是一个数组，只能转换二位数组（数组成员是数组）的形式：
  // _.object([['moe', 30], ['larry', 40], ['curly', 50]]); => {moe: 30, larry: 40, curly: 50}
  _.object = function(list, values) {
    var result = {};
    for (var i = 0, length = getLength(list); i < length; i++) {
      // 两个参数数组。
      if (values) {
        result[list[i]] = values[i];
      } else {
        // 一个参数组数，仅支持二位数组。
        result[list[i][0]] = list[i][1];
      }
    }
    return result;
  };

  // Generator function to create the findIndex and findLastIndex functions.
  // 位置预测函数生成器，通过 dir 区分，生成 findIndex 和 findLastIndex 等位置查询函数。
  var createPredicateIndexFinder = function(dir) {
    return function(array, predicate, context) {
      predicate = cb(predicate, context);
      var length = getLength(array);
      var index = dir > 0 ? 0 : length - 1;
      for (; index >= 0 && index < length; index += dir) {
        // 只取第一次满足条件的位置。
        if (predicate(array[index], index, array)) return index;
      }
      return -1;
    };
  };

  // Returns the first index on an array-like that passes a predicate test.
  // 正序（从左往右），查找第一次满足条件的位置。
  _.findIndex = createPredicateIndexFinder(1);
  // 倒序（从右往左），查找第一次满足条件的位置。
  _.findLastIndex = createPredicateIndexFinder(-1);

  // Use a comparator function to figure out the smallest index at which
  // an object should be inserted so as to maintain order. Uses binary search.
  // 返回 obj 应当在 array 中的位置。
  // _.sortedIndex([10, 20, 30, 40, 50], 35); => 3
  // _.sortedIndex([{name: 'moe', age: 40}, {name: 'curly', age: 60}], {name: 'larry', age: 50}, 'age'); => 1
  _.sortedIndex = function(array, obj, iteratee, context) {
    // 可以传入不同的类型。
    iteratee = cb(iteratee, context, 1);
    var value = iteratee(obj);
    var low = 0, high = getLength(array);
    // 二分查找。
    while (low < high) {
      var mid = Math.floor((low + high) / 2);
      if (iteratee(array[mid]) < value) low = mid + 1; else high = mid;
    }
    return low;
  };

  // Generator function to create the indexOf and lastIndexOf functions.
  // 创建一个查询某位置元素的 Finder，通过 dir（1：正序；-1：倒序）决定查询的方向。
  var createIndexFinder = function(dir, predicateFind, sortedIndex) {
    return function(array, item, idx) {
      var i = 0, length = getLength(array);
      if (typeof idx == 'number') {
        if (dir > 0) {
          i = idx >= 0 ? idx : Math.max(idx + length, i);
        } else {
          length = idx >= 0 ? Math.min(idx + 1, length) : idx + length + 1;
        }
      } else if (sortedIndex && idx && length) {
        idx = sortedIndex(array, item);
        return array[idx] === item ? idx : -1;
      }
      if (item !== item) {
        idx = predicateFind(slice.call(array, i, length), _.isNaN);
        return idx >= 0 ? idx + i : -1;
      }
      for (idx = dir > 0 ? i : length - 1; idx >= 0 && idx < length; idx += dir) {
        if (array[idx] === item) return idx;
      }
      return -1;
    };
  };

  // Return the position of the first occurrence of an item in an array,
  // or -1 if the item is not included in the array.
  // If the array is large and already in sort order, pass `true`
  // for **isSorted** to use binary search.
  // 从左到右查找，返回第一个对应元素的位置，查不到则返回-1。
  // 与 ES6 中 Array.prototype.findIndex 使用方法类似。
  _.indexOf = createIndexFinder(1, _.findIndex, _.sortedIndex);
  // 从右到左查找，返回第一个对应元素的位置，查不到则返回-1。
  _.lastIndexOf = createIndexFinder(-1, _.findLastIndex);

  // Generate an integer Array containing an arithmetic progression. A port of
  // the native Python `range()` function. See
  // [the Python documentation](http://docs.python.org/library/functions.html#range).
  // 根据起始位置、终止位置、步长，生成数组序列 [start, stop)。
  // _.range(1, 5, 3); => [1, 4]
  // _.range(5); => [0, 1, 2, 3, 4]
  // _.range(-5); => [0, -1, -2, -3, -4]
  _.range = function(start, stop, step) {
    // 校正终止位置，若无 stop（只有一个参数）时，start = 0，stop 是参数值。
    if (stop == null) {
      stop = start || 0;
      start = 0;
    }
    // 校正步长，若无 step 参数，根据 start<stop 来判定行进方向，正向 1，负向 -1。
    if (!step) {
      step = stop < start ? -1 : 1;
    }
    // 计算最终数组的长度，ceil() 是向上取整。
    var length = Math.max(Math.ceil((stop - start) / step), 0);
    var range = Array(length);

    for (var idx = 0; idx < length; idx++, start += step) {
      range[idx] = start;
    }

    return range;
  };

  // Chunk a single array into multiple arrays, each containing `count` or fewer
  // items.
  // 将数组分成若干份，每份 count 个元素（剩余不足 count 个放入一个数组），再组成一个数组。若没传参数 count 返回空数组。
  // _.chunk([1,2,3,4,5,6,7], 2); => [[1,2], [3,4], [5,6], [7]]
  _.chunk = function(array, count) {
    if (count == null || count < 1) return [];
    var result = [];
    var i = 0, length = array.length;
    while (i < length) {
      result.push(slice.call(array, i, i += count));
    }
    return result;
  };

  // Function (ahem) Functions
  // 函数扩展方法（15个）
  // ------------------

  // Determines whether to execute a function as a constructor
  // or a normal function with the provided arguments.
  // 执行绑定后的函数。根据调用的方式不同进行区分：普通函数执行；当构造函数执行（new 掉用）。
  var executeBound = function(sourceFunc, boundFunc, context, callingContext, args) {
    // 非 new 调用，直接调用 apply。
    if (!(callingContext instanceof boundFunc)) return sourceFunc.apply(context, args);
    // new 调用，context => self。
    var self = baseCreate(sourceFunc.prototype);
    var result = sourceFunc.apply(self, args);
    // 如果构造函数返回了对象，则返回该对象。
    if (_.isObject(result)) return result;
    // 否则返回 self。
    return self;
  };

  // Create a function bound to a given object (assigning `this`, and arguments,
  // optionally). Delegates to **ECMAScript 5**'s native `Function.bind` if
  // available.
  // 定义型绑定（区别于调用型绑定：apply、call），将 func 中的 this 指向 context 对象。
  // ES5 Function.prototype.bind 方法的扩展（polyfill)。
  _.bind = restArguments(function(func, context, args) {
    // 如果 func 不是函数，抛出错误。
    if (!_.isFunction(func)) throw new TypeError('Bind must be called on a function');
    // 返回执行函数，这种方式写主要是为了能够传递 rest 参数。
    var bound = restArguments(function(callArgs) {
      return executeBound(func, bound, context, this, args.concat(callArgs));
    });
    return bound;
  });

  // Partially apply a function by creating a version that has had some of its
  // arguments pre-filled, without changing its dynamic `this` context. _ acts
  // as a placeholder by default, allowing any combination of arguments to be
  // pre-filled. Set `_.partial.placeholder` for a custom placeholder argument.
  // 通过该函数，将原本函数中的部分参数确定下来，返回新函数，只需传入缺少的参数。
  // 称为偏函数。
  // 还提供了占位符机制，更灵活的处理那些已经确定的参数位置。
  _.partial = restArguments(function(func, boundArgs) {
    // 占位符。
    var placeholder = _.partial.placeholder;
    var bound = function() {
      // position 用来标识当前已赋值的 arguments 个数。
      var position = 0, length = boundArgs.length;
      var args = Array(length);
      for (var i = 0; i < length; i++) {
        // 如果有占位符，argus 赋值 bound 的 arguments 对应占位符位置的参数, 之后刷新位置（position++）, 
        // 否则赋值绑定时对应位置的参数（boundArgs）。
        args[i] = boundArgs[i] === placeholder ? arguments[position++] : boundArgs[i];
      }
      // 如果 bound 函数还有剩余参数，合并剩余的参数。
      while (position < arguments.length) args.push(arguments[position++]);
      return executeBound(func, bound, this, this, args);
    };
    return bound;
  });

  // 默认被理解的占位符为 _ , 允许自定义。
  _.partial.placeholder = _;

  // Bind a number of an object's methods to that object. Remaining arguments
  // are the method names to be bound. Useful for ensuring that all callbacks
  // defined on an object belong to it.
  // 将一系列方法（以名字的形式传递）中的 this 指向 obj 对象。
  _.bindAll = restArguments(function(obj, keys) {
    // 深度、非严格展开 keys 参数。
    keys = flatten(keys, false, false);
    var index = keys.length;
    // 值有一个参数，即 keys = []，没有传入任何 functionName，报错。
    if (index < 1) throw new Error('bindAll must be passed function names');
    while (index--) {
      var key = keys[index];
      // 逐个绑定。
      obj[key] = _.bind(obj[key], obj);
    }
  });

  // Memoize an expensive function by storing its results.
  _.memoize = function(func, hasher) {
    var memoize = function(key) {
      var cache = memoize.cache;
      var address = '' + (hasher ? hasher.apply(this, arguments) : key);
      if (!has(cache, address)) cache[address] = func.apply(this, arguments);
      return cache[address];
    };
    memoize.cache = {};
    return memoize;
  };

  // Delays a function for the given number of milliseconds, and then calls
  // it with the arguments supplied.
  _.delay = restArguments(function(func, wait, args) {
    return setTimeout(function() {
      return func.apply(null, args);
    }, wait);
  });

  // Defers a function, scheduling it to run after the current call stack has
  // cleared.
  _.defer = _.partial(_.delay, _, 1);

  // Returns a function, that, when invoked, will only be triggered at most once
  // during a given window of time. Normally, the throttled function will run
  // as much as it can, without ever going more than once per `wait` duration;
  // but if you'd like to disable the execution on the leading edge, pass
  // `{leading: false}`. To disable execution on the trailing edge, ditto.
  _.throttle = function(func, wait, options) {
    var timeout, context, args, result;
    var previous = 0;
    if (!options) options = {};

    var later = function() {
      previous = options.leading === false ? 0 : _.now();
      timeout = null;
      result = func.apply(context, args);
      if (!timeout) context = args = null;
    };

    var throttled = function() {
      var now = _.now();
      if (!previous && options.leading === false) previous = now;
      var remaining = wait - (now - previous);
      context = this;
      args = arguments;
      if (remaining <= 0 || remaining > wait) {
        if (timeout) {
          clearTimeout(timeout);
          timeout = null;
        }
        previous = now;
        result = func.apply(context, args);
        if (!timeout) context = args = null;
      } else if (!timeout && options.trailing !== false) {
        timeout = setTimeout(later, remaining);
      }
      return result;
    };

    throttled.cancel = function() {
      clearTimeout(timeout);
      previous = 0;
      timeout = context = args = null;
    };

    return throttled;
  };

  // Returns a function, that, as long as it continues to be invoked, will not
  // be triggered. The function will be called after it stops being called for
  // N milliseconds. If `immediate` is passed, trigger the function on the
  // leading edge, instead of the trailing.
  _.debounce = function(func, wait, immediate) {
    var timeout, result;

    var later = function(context, args) {
      timeout = null;
      if (args) result = func.apply(context, args);
    };

    var debounced = restArguments(function(args) {
      if (timeout) clearTimeout(timeout);
      if (immediate) {
        var callNow = !timeout;
        timeout = setTimeout(later, wait);
        if (callNow) result = func.apply(this, args);
      } else {
        timeout = _.delay(later, wait, this, args);
      }

      return result;
    });

    debounced.cancel = function() {
      clearTimeout(timeout);
      timeout = null;
    };

    return debounced;
  };

  // Returns the first function passed as an argument to the second,
  // allowing you to adjust arguments, run code before and after, and
  // conditionally execute the original function.
  _.wrap = function(func, wrapper) {
    return _.partial(wrapper, func);
  };

  // Returns a negated version of the passed-in predicate.
  // 返回 predicate 迭代结果的的补集（结果刚好相反）。
  _.negate = function(predicate) {
    return function() {
      return !predicate.apply(this, arguments);
    };
  };

  // Returns a function that is the composition of a list of functions, each
  // consuming the return value of the function that follows.
  _.compose = function() {
    var args = arguments;
    var start = args.length - 1;
    return function() {
      var i = start;
      var result = args[start].apply(this, arguments);
      while (i--) result = args[i].call(this, result);
      return result;
    };
  };

  // Returns a function that will only be executed on and after the Nth call.
  _.after = function(times, func) {
    return function() {
      if (--times < 1) {
        return func.apply(this, arguments);
      }
    };
  };

  // Returns a function that will only be executed up to (but not including) the Nth call.
  _.before = function(times, func) {
    var memo;
    return function() {
      if (--times > 0) {
        memo = func.apply(this, arguments);
      }
      if (times <= 1) func = null;
      return memo;
    };
  };

  // Returns a function that will be executed at most one time, no matter how
  // often you call it. Useful for lazy initialization.
  _.once = _.partial(_.before, 2);

  _.restArguments = restArguments;

  // Object Functions
  // ----------------

  // Keys in IE < 9 that won't be iterated by `for key in ...` and thus missed.
  // 判断是否在 IE < 9 的环境中。
  // IE < 9 下，重写某些属性，依然是不可枚举的，据此来判断是否在 IE < 9 的环境中。
  var hasEnumBug = !{toString: null}.propertyIsEnumerable('toString');
  // IE < 9 下不能用 for in 来枚举的 key 值集合。
  // 其实还有个 `constructor` 属性，与这些方法不属于一类，特殊处理。
  var nonEnumerableProps = ['valueOf', 'isPrototypeOf', 'toString',
    'propertyIsEnumerable', 'hasOwnProperty', 'toLocaleString'];

  // 获取对象中所有不能枚举的属性。
  var collectNonEnumProps = function(obj, keys) {
    var nonEnumIdx = nonEnumerableProps.length;
    var constructor = obj.constructor;
    // 如果 构造函数被重写，则 proto 指向该原型，否则指向默认值 Object.prototype。
    var proto = _.isFunction(constructor) && constructor.prototype || ObjProto;

    // Constructor is a special case.
    // 构造函数特殊处理。
    // 如果有 constructor 且 不在 keys 中，放入 keys。
    var prop = 'constructor';
    if (has(obj, prop) && !_.contains(keys, prop)) keys.push(prop);

    while (nonEnumIdx--) {
      prop = nonEnumerableProps[nonEnumIdx];
      // 判断是否是自有属性（重写）obj[prop] !== proto[prop]。
      if (prop in obj && obj[prop] !== proto[prop] && !_.contains(keys, prop)) {
        keys.push(prop);
      }
    }
  };

  // Retrieve the names of an object's own properties.
  // Delegates to **ECMAScript 5**'s native `Object.keys`.
  // 获取对象的自有属性数组（包括: 自身的属性、可遍历属性;不包括: 继承的属性、不可遍历属性）。
  // 与 ES5 中 Object.keys 方法类似。
  _.keys = function(obj) {
    if (!_.isObject(obj)) return [];
    // 如果存在原生的 Object.keys 方法，直接调用。
    if (nativeKeys) return nativeKeys(obj);
    var keys = [];
    // 通过 _.has ，剔除掉非自有属性。
    for (var key in obj) if (has(obj, key)) keys.push(key);
    // Ahem, IE < 9.
    // IE < 9 的环境下。
    if (hasEnumBug) collectNonEnumProps(obj, keys);
    return keys;
  };

  // Retrieve all the property names of an object.
  // 获取对象的所有属性数组（包括: 自身的属性、继承的属性、可遍历属性、不可遍历属性）。
  _.allKeys = function(obj) {
    if (!_.isObject(obj)) return [];
    var keys = [];
    for (var key in obj) keys.push(key);
    // Ahem, IE < 9.
    // IE < 9 的环境下。
    if (hasEnumBug) collectNonEnumProps(obj, keys);
    return keys;
  };

  // Retrieve the values of an object's properties.
  // 获取对象的自有属性对应值的数组（包括: 自身的属性、可遍历属性;不包括: 继承的属性、不可遍历属性）。
  // 与 ES6 中 Object.values 方法类似。
  _.values = function(obj) {
    var keys = _.keys(obj);
    var length = keys.length;
    var values = Array(length);
    for (var i = 0; i < length; i++) {
      values[i] = obj[keys[i]];
    }
    return values;
  };

  // Returns the results of applying the iteratee to each element of the object.
  // In contrast to _.map it returns an object.
  _.mapObject = function(obj, iteratee, context) {
    iteratee = cb(iteratee, context);
    var keys = _.keys(obj),
        length = keys.length,
        results = {};
    for (var index = 0; index < length; index++) {
      var currentKey = keys[index];
      results[currentKey] = iteratee(obj[currentKey], currentKey, obj);
    }
    return results;
  };

  // Convert an object into a list of `[key, value]` pairs.
  // The opposite of _.object.
  _.pairs = function(obj) {
    var keys = _.keys(obj);
    var length = keys.length;
    var pairs = Array(length);
    for (var i = 0; i < length; i++) {
      pairs[i] = [keys[i], obj[keys[i]]];
    }
    return pairs;
  };

  // Invert the keys and values of an object. The values must be serializable.
  _.invert = function(obj) {
    var result = {};
    var keys = _.keys(obj);
    for (var i = 0, length = keys.length; i < length; i++) {
      result[obj[keys[i]]] = keys[i];
    }
    return result;
  };

  // Return a sorted list of the function names available on the object.
  // Aliased as `methods`.
  // 返回传入对象的函数属性排序后的数组（包含继承的函数属性，不包含不可遍的属性）。
  _.functions = _.methods = function(obj) {
    var names = [];
    // for...in 循环 包括: 自身的属性、继承的属性、可遍历属性;不包括: 不可遍历属性。
    for (var key in obj) {
      if (_.isFunction(obj[key])) names.push(key);
    }
    return names.sort();
  };

  // An internal function for creating assigner functions.
  // 创建分配器函数（Assigner）, 分配属性到某个对象。
  var createAssigner = function(keysFunc, defaults) {
    // defaults => undefinedOnly，默认是 false ，表示相同属性会被覆盖；ture：相同属性仅在值为 undefined 时才会覆盖。
    return function(obj) {
      var length = arguments.length;
      if (defaults) obj = Object(obj);
      // 参数少于两个（0、1），即表示不进行扩展，直接返回。
      if (length < 2 || obj == null) return obj;
      // 仅遍历第一个参数之外的参数（出去最终合并输出的对象），从中不断取值，赋给 obj。
      for (var index = 1; index < length; index++) {
        var source = arguments[index],
            keys = keysFunc(source),
            l = keys.length;
        for (var i = 0; i < l; i++) {
          var key = keys[i];
          // defaults：false 默认模式，同属性直接覆盖。
          // defaults：true ，当同属性的值为 undefined 时，才会覆盖。
          if (!defaults || obj[key] === void 0) obj[key] = source[key];
        }
      }
      return obj;
    };
  };

  // Extend a given object with all the properties in passed-in object(s).
  // 扩展一个对象，它将继承传入的各个对象的属性(包括原型链上非自身的属性)。
  _.extend = createAssigner(_.allKeys);

  // Assigns a given object with all the own properties in the passed-in object(s).
  // (https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Object/assign)
  // 扩展一个对象，只会包含目标对象自身的属性，不包含继承属性。
  _.extendOwn = _.assign = createAssigner(_.keys);

  // Returns the first key on an object that passes a predicate test.
  // 通过真值检测函数 predicate 找到对象中第一个满足条件的 key。
  _.findKey = function(obj, predicate, context) {
    predicate = cb(predicate, context);
    var keys = _.keys(obj), key;
    for (var i = 0, length = keys.length; i < length; i++) {
      key = keys[i];
      if (predicate(obj[key], key, obj)) return key;
    }
  };

  // Internal pick helper function to determine if `obj` has key `key`.
  var keyInObj = function(value, key, obj) {
    return key in obj;
  };

  // Return a copy of the object only containing the whitelisted properties.
  _.pick = restArguments(function(obj, keys) {
    var result = {}, iteratee = keys[0];
    if (obj == null) return result;
    if (_.isFunction(iteratee)) {
      if (keys.length > 1) iteratee = optimizeCb(iteratee, keys[1]);
      keys = _.allKeys(obj);
    } else {
      iteratee = keyInObj;
      keys = flatten(keys, false, false);
      obj = Object(obj);
    }
    for (var i = 0, length = keys.length; i < length; i++) {
      var key = keys[i];
      var value = obj[key];
      if (iteratee(value, key, obj)) result[key] = value;
    }
    return result;
  });

  // Return a copy of the object without the blacklisted properties.
  _.omit = restArguments(function(obj, keys) {
    var iteratee = keys[0], context;
    if (_.isFunction(iteratee)) {
      iteratee = _.negate(iteratee);
      if (keys.length > 1) context = keys[1];
    } else {
      keys = _.map(flatten(keys, false, false), String);
      iteratee = function(value, key) {
        return !_.contains(keys, key);
      };
    }
    return _.pick(obj, iteratee, context);
  });

  // Fill in a given object with default properties.
  // 使用默认对象 defaultObj 进行填充 obj（只会覆盖未定义的同名属性），例：_.defaults( obj, defaultObj);
  _.defaults = createAssigner(_.allKeys, true);

  // Creates an object that inherits from the given prototype object.
  // If additional properties are provided then they will be added to the
  // created object.
  _.create = function(prototype, props) {
    var result = baseCreate(prototype);
    if (props) _.extendOwn(result, props);
    return result;
  };

  // Create a (shallow-cloned) duplicate of an object.
  // 浅克隆（嵌套的对象或者数组都会跟原对象用同一个引用）。
  _.clone = function(obj) {
    // 不是对象、数组，直接返回原引用（主要针对基本类型，但是有问题）。
    if (!_.isObject(obj)) return obj;
    // 数组、对象分别处理。
    return _.isArray(obj) ? obj.slice() : _.extend({}, obj);
  };

  // Invokes interceptor with the obj, and then returns obj.
  // The primary purpose of this method is to "tap into" a method chain, in
  // order to perform operations on intermediate results within the chain.
  _.tap = function(obj, interceptor) {
    interceptor(obj);
    return obj;
  };

  // Returns whether an object has a given set of `key:value` pairs.
  // 校验一个 object 是否满足匹配的键值对。
  _.isMatch = function(object, attrs) {
    var keys = _.keys(attrs), length = keys.length;
    if (object == null) return !length;
    var obj = Object(object);
    for (var i = 0; i < length; i++) {
      var key = keys[i];
      if (attrs[key] !== obj[key] || !(key in obj)) return false;
    }
    return true;
  };


  // Internal recursive comparison function for `isEqual`.
  var eq, deepEq;
  eq = function(a, b, aStack, bStack) {
    // Identical objects are equal. `0 === -0`, but they aren't identical.
    // See the [Harmony `egal` proposal](http://wiki.ecmascript.org/doku.php?id=harmony:egal).
    if (a === b) return a !== 0 || 1 / a === 1 / b;
    // `null` or `undefined` only equal to itself (strict comparison).
    if (a == null || b == null) return false;
    // `NaN`s are equivalent, but non-reflexive.
    if (a !== a) return b !== b;
    // Exhaust primitive checks
    var type = typeof a;
    if (type !== 'function' && type !== 'object' && typeof b != 'object') return false;
    return deepEq(a, b, aStack, bStack);
  };

  // Internal recursive comparison function for `isEqual`.
  deepEq = function(a, b, aStack, bStack) {
    // Unwrap any wrapped objects.
    if (a instanceof _) a = a._wrapped;
    if (b instanceof _) b = b._wrapped;
    // Compare `[[Class]]` names.
    var className = toString.call(a);
    if (className !== toString.call(b)) return false;
    switch (className) {
      // Strings, numbers, regular expressions, dates, and booleans are compared by value.
      case '[object RegExp]':
      // RegExps are coerced to strings for comparison (Note: '' + /a/i === '/a/i')
      case '[object String]':
        // Primitives and their corresponding object wrappers are equivalent; thus, `"5"` is
        // equivalent to `new String("5")`.
        return '' + a === '' + b;
      case '[object Number]':
        // `NaN`s are equivalent, but non-reflexive.
        // Object(NaN) is equivalent to NaN.
        if (+a !== +a) return +b !== +b;
        // An `egal` comparison is performed for other numeric values.
        return +a === 0 ? 1 / +a === 1 / b : +a === +b;
      case '[object Date]':
      case '[object Boolean]':
        // Coerce dates and booleans to numeric primitive values. Dates are compared by their
        // millisecond representations. Note that invalid dates with millisecond representations
        // of `NaN` are not equivalent.
        return +a === +b;
      case '[object Symbol]':
        return SymbolProto.valueOf.call(a) === SymbolProto.valueOf.call(b);
    }

    var areArrays = className === '[object Array]';
    if (!areArrays) {
      if (typeof a != 'object' || typeof b != 'object') return false;

      // Objects with different constructors are not equivalent, but `Object`s or `Array`s
      // from different frames are.
      var aCtor = a.constructor, bCtor = b.constructor;
      if (aCtor !== bCtor && !(_.isFunction(aCtor) && aCtor instanceof aCtor &&
                               _.isFunction(bCtor) && bCtor instanceof bCtor)
                          && ('constructor' in a && 'constructor' in b)) {
        return false;
      }
    }
    // Assume equality for cyclic structures. The algorithm for detecting cyclic
    // structures is adapted from ES 5.1 section 15.12.3, abstract operation `JO`.

    // Initializing stack of traversed objects.
    // It's done here since we only need them for objects and arrays comparison.
    aStack = aStack || [];
    bStack = bStack || [];
    var length = aStack.length;
    while (length--) {
      // Linear search. Performance is inversely proportional to the number of
      // unique nested structures.
      if (aStack[length] === a) return bStack[length] === b;
    }

    // Add the first object to the stack of traversed objects.
    aStack.push(a);
    bStack.push(b);

    // Recursively compare objects and arrays.
    if (areArrays) {
      // Compare array lengths to determine if a deep comparison is necessary.
      length = a.length;
      if (length !== b.length) return false;
      // Deep compare the contents, ignoring non-numeric properties.
      while (length--) {
        if (!eq(a[length], b[length], aStack, bStack)) return false;
      }
    } else {
      // Deep compare objects.
      var keys = _.keys(a), key;
      length = keys.length;
      // Ensure that both objects contain the same number of properties before comparing deep equality.
      if (_.keys(b).length !== length) return false;
      while (length--) {
        // Deep compare each member
        key = keys[length];
        if (!(has(b, key) && eq(a[key], b[key], aStack, bStack))) return false;
      }
    }
    // Remove the first object from the stack of traversed objects.
    aStack.pop();
    bStack.pop();
    return true;
  };

  // Perform a deep comparison to check if two objects are equal.
  _.isEqual = function(a, b) {
    return eq(a, b);
  };

  // Is a given array, string, or object empty?
  // An "empty" object has no enumerable own-properties.
  _.isEmpty = function(obj) {
    if (obj == null) return true;
    if (isArrayLike(obj) && (_.isArray(obj) || _.isString(obj) || _.isArguments(obj))) return obj.length === 0;
    return _.keys(obj).length === 0;
  };

  // Is a given value a DOM element?
  _.isElement = function(obj) {
    return !!(obj && obj.nodeType === 1);
  };

  // Is a given value an array?
  // Delegates to ECMA5's native Array.isArray
  _.isArray = nativeIsArray || function(obj) {
    return toString.call(obj) === '[object Array]';
  };

  // Is a given variable an object?
  _.isObject = function(obj) {
    var type = typeof obj;
    return type === 'function' || type === 'object' && !!obj;
  };

  // Add some isType methods: isArguments, isFunction, isString, isNumber, isDate, isRegExp, isError, isMap, isWeakMap, isSet, isWeakSet.
  _.each(['Arguments', 'Function', 'String', 'Number', 'Date', 'RegExp', 'Error', 'Symbol', 'Map', 'WeakMap', 'Set', 'WeakSet'], function(name) {
    _['is' + name] = function(obj) {
      return toString.call(obj) === '[object ' + name + ']';
    };
  });

  // Define a fallback version of the method in browsers (ahem, IE < 9), where
  // there isn't any inspectable "Arguments" type.
  if (!_.isArguments(arguments)) {
    _.isArguments = function(obj) {
      return has(obj, 'callee');
    };
  }

  // Optimize `isFunction` if appropriate. Work around some typeof bugs in old v8,
  // IE 11 (#1621), Safari 8 (#1929), and PhantomJS (#2236).
  var nodelist = root.document && root.document.childNodes;
  if (typeof /./ != 'function' && typeof Int8Array != 'object' && typeof nodelist != 'function') {
    _.isFunction = function(obj) {
      return typeof obj == 'function' || false;
    };
  }

  // Is a given object a finite number?
  _.isFinite = function(obj) {
    return !_.isSymbol(obj) && isFinite(obj) && !isNaN(parseFloat(obj));
  };

  // Is the given value `NaN`?
  _.isNaN = function(obj) {
    return _.isNumber(obj) && isNaN(obj);
  };

  // Is a given value a boolean?
  _.isBoolean = function(obj) {
    return obj === true || obj === false || toString.call(obj) === '[object Boolean]';
  };

  // Is a given value equal to null?
  _.isNull = function(obj) {
    return obj === null;
  };

  // Is a given variable undefined?
  _.isUndefined = function(obj) {
    return obj === void 0;
  };

  // Shortcut function for checking if an object has a given property directly
  // on itself (in other words, not on a prototype).
  _.has = function(obj, path) {
    if (!_.isArray(path)) {
      return has(obj, path);
    }
    var length = path.length;
    for (var i = 0; i < length; i++) {
      var key = path[i];
      if (obj == null || !hasOwnProperty.call(obj, key)) {
        return false;
      }
      obj = obj[key];
    }
    return !!length;
  };

  // Utility Functions
  // -----------------

  // Run Underscore.js in *noConflict* mode, returning the `_` variable to its
  // previous owner. Returns a reference to the Underscore object.
  // 将之前的 _ 恢复，返回 underscorce 的关联关系，指向一个新的变量。
  _.noConflict = function() {
    root._ = previousUnderscore;
    return this;
  };

  // Keep the identity function around for default iteratees.
  // 返回值本身。
  _.identity = function(value) {
    return value;
  };

  // Predicate-generating functions. Often useful outside of Underscore.
  // 返回一个函数，返回的函数都够返回 value 自身。
  // 可以用于返回一些固定值得情况，使语义更明确。
  _.constant = function(value) {
    return function() {
      return value;
    };
  };

  // 空函数。
  // 可以用来为某个对象的方法赋值初始值，从而减少判断。
  _.noop = function(){};

  // Creates a function that, when passed an object, will traverse that object’s
  // properties down the given `path`, specified as an array of keys or indexes.
  // 返回能某个对象指定属性的值。
  _.property = function(path) {
    // 不是数组。
    if (!_.isArray(path)) {
      return shallowProperty(path);
    }
    // 数组时，可以根据数组来深度取值。
    return function(obj) {
      return deepGet(obj, path);
    };
  };

  // Generates a function for a given object that returns a given property.
  // 返回能够获得某个对象指定属性的方法。
  // 可以直接用来作为回调函数，例 _.map([], (key) => person(key)) =>  _.map([], _.propertyOf(person))。
  _.propertyOf = function(obj) {
    if (obj == null) {
      return function(){};
    }
    return function(path) {
      return !_.isArray(path) ? obj[path] : deepGet(obj, path);
    };
  };

  // Returns a predicate for checking whether an object has a given set of
  // `key:value` pairs.
  // 返回一个属性检测函数，检测某个对象是否具有指定属性。
  _.matcher = _.matches = function(attrs) {
    attrs = _.extendOwn({}, attrs);
    return function(obj) {
      return _.isMatch(obj, attrs);
    };
  };

  // Run a function **n** times.
  _.times = function(n, iteratee, context) {
    var accum = Array(Math.max(0, n));
    iteratee = optimizeCb(iteratee, context, 1);
    for (var i = 0; i < n; i++) accum[i] = iteratee(i);
    return accum;
  };

  // Return a random integer between min and max (inclusive).
  // 返回指定区间的随机数，注意结果是闭区间：[min, max]。
  _.random = function(min, max) {
    if (max == null) {
      max = min;
      min = 0;
    }
    return min + Math.floor(Math.random() * (max - min + 1));
  };

  // A (possibly faster) way to get the current timestamp as an integer.
  // 获得当前的时间戳。
  _.now = Date.now || function() {
    return new Date().getTime();
  };

  // List of HTML entities for escaping.
  var escapeMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '`': '&#x60;'
  };
  var unescapeMap = _.invert(escapeMap);

  // Functions for escaping and unescaping strings to/from HTML interpolation.
  var createEscaper = function(map) {
    var escaper = function(match) {
      return map[match];
    };
    // Regexes for identifying a key that needs to be escaped.
    var source = '(?:' + _.keys(map).join('|') + ')';
    var testRegexp = RegExp(source);
    var replaceRegexp = RegExp(source, 'g');
    return function(string) {
      string = string == null ? '' : '' + string;
      return testRegexp.test(string) ? string.replace(replaceRegexp, escaper) : string;
    };
  };
  _.escape = createEscaper(escapeMap);
  _.unescape = createEscaper(unescapeMap);

  // Traverses the children of `obj` along `path`. If a child is a function, it
  // is invoked with its parent as context. Returns the value of the final
  // child, or `fallback` if any child is undefined.
  _.result = function(obj, path, fallback) {
    if (!_.isArray(path)) path = [path];
    var length = path.length;
    if (!length) {
      return _.isFunction(fallback) ? fallback.call(obj) : fallback;
    }
    for (var i = 0; i < length; i++) {
      var prop = obj == null ? void 0 : obj[path[i]];
      if (prop === void 0) {
        prop = fallback;
        i = length; // Ensure we don't continue iterating.
      }
      obj = _.isFunction(prop) ? prop.call(obj) : prop;
    }
    return obj;
  };

  // Generate a unique integer id (unique within the entire client session).
  // Useful for temporary DOM ids.
  var idCounter = 0;
  _.uniqueId = function(prefix) {
    var id = ++idCounter + '';
    return prefix ? prefix + id : id;
  };

  // By default, Underscore uses ERB-style template delimiters, change the
  // following template settings to use alternative delimiters.
  _.templateSettings = {
    evaluate: /<%([\s\S]+?)%>/g,
    interpolate: /<%=([\s\S]+?)%>/g,
    escape: /<%-([\s\S]+?)%>/g
  };

  // When customizing `templateSettings`, if you don't want to define an
  // interpolation, evaluation or escaping regex, we need one that is
  // guaranteed not to match.
  var noMatch = /(.)^/;

  // Certain characters need to be escaped so that they can be put into a
  // string literal.
  var escapes = {
    "'": "'",
    '\\': '\\',
    '\r': 'r',
    '\n': 'n',
    '\u2028': 'u2028',
    '\u2029': 'u2029'
  };

  var escapeRegExp = /\\|'|\r|\n|\u2028|\u2029/g;

  var escapeChar = function(match) {
    return '\\' + escapes[match];
  };

  // JavaScript micro-templating, similar to John Resig's implementation.
  // Underscore templating handles arbitrary delimiters, preserves whitespace,
  // and correctly escapes quotes within interpolated code.
  // NB: `oldSettings` only exists for backwards compatibility.
  _.template = function(text, settings, oldSettings) {
    if (!settings && oldSettings) settings = oldSettings;
    settings = _.defaults({}, settings, _.templateSettings);

    // Combine delimiters into one regular expression via alternation.
    var matcher = RegExp([
      (settings.escape || noMatch).source,
      (settings.interpolate || noMatch).source,
      (settings.evaluate || noMatch).source
    ].join('|') + '|$', 'g');

    // Compile the template source, escaping string literals appropriately.
    var index = 0;
    var source = "__p+='";
    text.replace(matcher, function(match, escape, interpolate, evaluate, offset) {
      source += text.slice(index, offset).replace(escapeRegExp, escapeChar);
      index = offset + match.length;

      if (escape) {
        source += "'+\n((__t=(" + escape + "))==null?'':_.escape(__t))+\n'";
      } else if (interpolate) {
        source += "'+\n((__t=(" + interpolate + "))==null?'':__t)+\n'";
      } else if (evaluate) {
        source += "';\n" + evaluate + "\n__p+='";
      }

      // Adobe VMs need the match returned to produce the correct offset.
      return match;
    });
    source += "';\n";

    // If a variable is not specified, place data values in local scope.
    if (!settings.variable) source = 'with(obj||{}){\n' + source + '}\n';

    source = "var __t,__p='',__j=Array.prototype.join," +
      "print=function(){__p+=__j.call(arguments,'');};\n" +
      source + 'return __p;\n';

    var render;
    try {
      render = new Function(settings.variable || 'obj', '_', source);
    } catch (e) {
      e.source = source;
      throw e;
    }

    var template = function(data) {
      return render.call(this, data, _);
    };

    // Provide the compiled source as a convenience for precompilation.
    var argument = settings.variable || 'obj';
    template.source = 'function(' + argument + '){\n' + source + '}';

    return template;
  };

  // Add a "chain" function. Start chaining a wrapped Underscore object.
  // 支持链式调用
  _.chain = function(obj) {
    // 根据参数，生成 underscore 对象
    var instance = _(obj);
    // 标记是否使用链式操作
    instance._chain = true;
    // 返回该 underscore 对象
    return instance;
  };

  // OOP
  // ---------------
  // If Underscore is called as a function, it returns a wrapped object that
  // can be used OO-style. This wrapper holds altered versions of all the
  // underscore functions. Wrapped objects may be chained.

  // Helper function to continue chaining intermediate results.
  // 根据 _chain 属性，判断结果是否需要链式调用
  var chainResult = function(instance, obj) {
    return instance._chain ? _(obj).chain() : obj;
  };

  // Add your own custom functions to the Underscore object.
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
        // 支持链式调用
        return chainResult(this, func.apply(_, args));
      };
    });
    return _;
  };

  // Add all of the Underscore functions to the wrapper object.
  // 将前面定义的 underscore 方法添加给包装过的对象，即添加到原型上。
  _.mixin(_);

  // Add all mutator Array functions to the wrapper.
  _.each(['pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift'], function(name) {
    var method = ArrayProto[name];
    _.prototype[name] = function() {
      var obj = this._wrapped;
      method.apply(obj, arguments);
      if ((name === 'shift' || name === 'splice') && obj.length === 0) delete obj[0];
      return chainResult(this, obj);
    };
  });

  // Add all accessor Array functions to the wrapper.
  _.each(['concat', 'join', 'slice'], function(name) {
    var method = ArrayProto[name];
    _.prototype[name] = function() {
      return chainResult(this, method.apply(this._wrapped, arguments));
    };
  });

  // Extracts the result from a wrapped and chained object.
  // 返回 _wrapped 值
  _.prototype.value = function() {
    return this._wrapped;
  };

  // Provide unwrapping proxy for some methods used in engine operations
  // such as arithmetic and JSON stringification.
  // 重写 valueOf、toJSON
  _.prototype.valueOf = _.prototype.toJSON = _.prototype.value;

  // 重写 toString
  _.prototype.toString = function() {
    return String(this._wrapped);
  };

  // AMD registration happens at the end for compatibility with AMD loaders
  // that may not enforce next-turn semantics on modules. Even though general
  // practice for AMD registration is to be anonymous, underscore registers
  // as a named module because, like jQuery, it is a base library that is
  // popular enough to be bundled in a third party lib, but not be part of
  // an AMD load request. Those cases could generate an error when an
  // anonymous define() is called outside of a loader request.
  if (typeof define == 'function' && define.amd) {
    define('underscore', [], function() {
      return _;
    });
  }
}());
