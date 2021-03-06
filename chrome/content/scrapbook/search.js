var searchEngine = {

	_cache: null,
	_scrapbook: null,
	config: {
		'default_search': '',
		'default_field': 'tcc',
		'list_bullet': '◉'
	},

	init: function () {
		var that = this;
		if (location.protocol.match(/https?/)) {
			if (!confirm('Running this search engine could cause large network flow, are you sure to continue?')) {
				return;
			}
		}
		try {
			that.loadXMLDoc('cache.rdf', function(xml){
				var data = [];
				// some mobile browsers (e.g. Dolphin) do not support xmlDoc.getElementsByTagName
				var items = xml.documentElement.childNodes;
				for (var i = 0, len = items.length; i < len; i++) {
					var item = items[i];
					if (item.nodeName != 'RDF:Description') continue;
					var id_path = item.getAttribute('RDF:about').match(/^urn:scrapbook:item(\d{14})#(.*?)$/);
					// var folder = item.getAttribute('NS1:folder').match(/^urn:scrapbook:item(\d{14})$/);
					data.push({
						'id': id_path[1],
						'path': id_path[2],
						// 'folder': folder ? folder[1] : null,
						'content': item.getAttribute('NS1:content')
					});
				}
				that._cache = data;
				checkLoad();
			});
			that.loadXMLDoc('scrapbook.rdf', function(xml){
				var data = [];
				var items = xml.documentElement.childNodes;
				for (var i = 0, len = items.length; i < len; i++) {
					var item = items[i];
					if (item.nodeName != 'RDF:Description') continue;
					var id = item.getAttribute('NS1:id');
					data[id] = {
						'id': id,
						'type': item.getAttribute('NS1:type'),
						'title': item.getAttribute('NS1:title'),
						'source': item.getAttribute('NS1:source'),
						'comment': item.getAttribute('NS1:comment'),
						'create': item.getAttribute('NS1:create'),
						'modify': item.getAttribute('NS1:modify')
					};
				}
				that._scrapbook = data;
				checkLoad();
			});
		} catch(ex) {
			alert("Your browser doesn't support AJAX connection: \n" + ex.name + ': ' + ex.message);
			return;
		}

		function checkLoad() {
			if (that._cache && that._scrapbook) {
				document.getElementById('search').removeAttribute('disabled');
			}
		}
	},

	loadXMLDoc: function(url, callback) {
		var that = this;
		var xmlhttp;
		if (window.XMLHttpRequest) {  // code for IE7+, Firefox, Chrome, Opera, Safari
			xmlhttp = new XMLHttpRequest();
		}
		else {  // code for IE6, IE5
			xmlhttp = new ActiveXObject("Microsoft.XMLHTTP");
		}
		xmlhttp.onreadystatechange = function() {
			if (xmlhttp.readyState == 4) {
				if (xmlhttp.status == 200 || xmlhttp.status == 0) {
					callback.call(that, xmlhttp.responseXML);
				}
			}
		}
		xmlhttp.open("GET", url, true);
		xmlhttp.send();
		return xmlhttp;
	},

	search: function() {
		this.clearResult();
		try {
			// parse key
			var keyStr = document.getElementById('keyword').value;
			if (this.config['default_search']) keyStr = this.config['default_search'] + ' ' + keyStr;
			var key = this.parseQuery(keyStr);
			if (key.error.length) {
				for (var i = 0, len = key.error.length; i < len; i++) {
					this.addMsg(key.error[i]);
				}
				return;
			}
			// get result
			var result = [];
			for (var i = 0, len = this._cache.length; i < len; i++) {
				var item = this._cache[i];
				var data = {
					'cache': item,
					'item': this._scrapbook[item.id]
				};
				if (this.matchResult(data, key)) {
					result.push(data);
				}
			}
			// sort result
			for (var i = 0, len = key.sort.length; i < len; i++) {
				var sortKey = key.sort[i];
				result.sort(function(a, b){
					a = a[sortKey[0]][sortKey[1]];
					b = b[sortKey[0]][sortKey[1]];
					if (a > b) return sortKey[2];
					if (a < b) return -sortKey[2];
					return 0;
				});
			}
			// display result
			this.addMsg('Found ' + result.length + ' results:');
			for (var i = 0, len = result.length; i < len; i++) {
				this.addResult(result[i]);
			}
		}
		catch (ex) {
			alert("Script error: \n" + ex.name + ': ' + ex.message);
			throw ex;
		}
	},

	parseQuery: function(keyStr) {
		var that = this;
		var key = {
			'error': [],
			'rule': [],
			'sort': [],
			'mc': false,
			're': false,
			'default': this.config['default_field']
        };
		keyStr.replace(/(\-?[A-Za-z]+:|\-)(?:"((?:\\"|[^"])*)"|([^ "\u3000]*))|(?:"((?:""|[^"])*)"|([^ "\u3000]+))/g, function(match, cmd, qterm, term, qterm2, term2){
			if (cmd) {
				var term = qterm ? qterm.replace(/""/g, '"') : term;
			}
			else {
				var term = qterm2 ? qterm2.replace(/""/g, '"') : term2;
			}
			// commands that don't require a term
			// the term will then be reguarded as a "tcc include"
			switch (cmd) {
				case "mc:":
					key.mc = true;
					break;
				case "-mc:":
					key.mc = false;
					break;
				case "re:":
					key.re = true;
					break;
				case "-re:":
					key.re = false;
					break;
				case "type:":
					addRule('type', 'include', term);
					term = false;
					break;
				case "-type:":
					addRule('type', 'exclude', term);
					term = false;
					break;
				case "sort:":
					addSort(term, 1);
					term = false;
					break;
				case "-sort:":
					addSort(term, -1);
					term = false;
					break;
			}
			// commands that require a term
			if (term) {
				switch (cmd) {
					case "id:":
						addRule('id', 'include', parseStr(term));
						break;
					case "-id:":
						addRule('id', 'exclude', parseStr(term));
						break;
					case "source:":
						addRule('source', 'include', parseStr(term));
						break;
					case "-source:":
						addRule('source', 'exclude', parseStr(term));
						break;
					case "title:":
						addRule('title', 'include', parseStr(term));
						break;
					case "-title:":
						addRule('title', 'exclude', parseStr(term));
						break;
					case "comment:":
						addRule('comment', 'include', parseStr(term));
						break;
					case "-comment:":
						addRule('comment', 'exclude', parseStr(term));
						break;
					case "content:":
						addRule('content', 'include', parseStr(term));
						break;
					case "-content:":
						addRule('content', 'exclude', parseStr(term));
						break;
					case "create:":
						addRule('create', 'include', parseDate(term));
						break;
					case "-create:":
						addRule('create', 'exclude', parseDate(term));
						break;
					case "modify:":
						addRule('modify', 'include', parseDate(term));
						break;
					case "-modify:":
						addRule('modify', 'exclude', parseDate(term));
						break;
					case "-":
						addRule(key['default'], 'exclude', parseStr(term));
						break;
					default:
						addRule(key['default'], 'include', parseStr(term));
						break;
				}
			}
			return "";

			function addRule(name, type, value) {
				if (key.rule[name] === undefined) key.rule[name] = { 'include': [], 'exclude': [] };
				key.rule[name][type].push(value);
			}

			function addSort(field, order) {
				if (['path', 'content'].indexOf(field) >= 0) {
					key.sort.push(['cache', field, order]);
					return;
				}
				key.sort.push(['item', field, order]);
			}

			function addError(msg) {
				key.error.push(msg);
			}

			function parseStr(term) {
				var options = key.mc ? 'm' : 'im';
				if (key.re) {
					try {
						var regex = new RegExp(term, options);
					} catch(ex) {
						addError("Invalid RegExp: " + term);
						return null;
					}
				}
				else {
					var regex = new RegExp(that.escapeRegExp(term), options);
				}
				return regex;
			}

			function parseDate(term) {
				var match = term.match(/^(\d{0,14})-?(\d{0,14})$/);
				if (!match) {
					addError("Invalid date format: " + term);
					return null;
				}
				var since = match[1] ? pad(match[1], 14) : pad(match[1], 14);
				var until = match[2] ? pad(match[2], 14) : pad(match[2], 14, "9");
				return [parseInt(since, 10), parseInt(until, 10)];
			}

			function pad(n, width, z) {
				z = z || '0';
				n = n + '';
				return n.length >= width ? n : n + new Array(width - n.length + 1).join(z);
			}
		});
		return key;
	},

	matchResult: function(data, key) {
		if (!data.item) {
			return false;
		}
		for (var i in key.rule) {
			if (!this['_match_'+i](key.rule[i], data)) return false;
		}
		return true;
	},

	_match_tcc : function(keyitem, data) {
		return this.matchText(keyitem, [data.item.title, data.item.comment, data.cache.content].join("\n"));
	},

	_match_content : function(keyitem, data) {
		return this.matchText(keyitem, data.cache.content);
	},

	_match_id : function(keyitem, data) {
		return this.matchText(keyitem, data.item.id);
	},

	_match_title : function(keyitem, data) {
		return this.matchText(keyitem, data.item.title);
	},

	_match_comment : function(keyitem, data) {
		return this.matchText(keyitem, data.item.comment);
	},

	_match_source : function(keyitem, data) {
		return this.matchText(keyitem, data.item.source);
	},

	_match_type : function(keyitem, data) {
		var type = data.item.type;
		for (var i=0, len=keyitem.exclude.length; i<len; i++) {
			if (type == keyitem.exclude[i]) {
				return false;
			}
		}
		// uses "or" clause
		if (!keyitem.include.length) return true;
		for (var i=0, len=keyitem.include.length; i<len; i++) {
			if (type == keyitem.include[i]) {
				return true;
			}
		}
		return false;
	},

	_match_create : function(keyitem, data) {
		return this.matchDate(keyitem, data.item.create);
	},

	_match_modify : function(keyitem, data) {
		return this.matchDate(keyitem, data.item.modify);
	},

	matchText : function(keyitem, text) {
		for (var i=0, len=keyitem.exclude.length; i<len; i++) {
			if (keyitem.exclude[i].test(text)) {
				return false;
			}
		}
		for (var i=0, len=keyitem.include.length; i<len; i++) {
			if (!keyitem.include[i].test(text)) {
				return false;
			}
		}
		return true;
	},

	matchDate : function(keyitem, date) {
		if (!date) return false;
		var date = parseInt(date, 10);
		for (var i=0, len=keyitem.exclude.length; i<len; i++) {
			if (keyitem.exclude[i][0] <= date && date <= keyitem.exclude[i][1]) {
				return false;
			}
		}
		for (var i=0, len=keyitem.include.length; i<len; i++) {
			if (!(keyitem.include[i][0] <= date && date <= keyitem.include[i][1])) {
				return false;
			}
		}
		return true;
	},

	addResult: function(data) {
		var cache = data.cache;
		var item = data.item;
		var wrapper = document.getElementById("result");
		var result = document.createElement("LI");
		var href = (item.type == 'bookmark') ?
			item.source :
			'data/' + item.id + '/' + cache.path.replace(/[^\/]+/g, function(m){return encodeURIComponent(m);});
		var bullet = this.config['list_bullet'] + ' ';
		if (item.type != 'bookmark') {
			var fhref = 'tree/frame.html#../' + href;
			var link = document.createElement("A");
			link.setAttribute('href', fhref);
			link.setAttribute('target', '_blank');
			link.setAttribute('class', 'bookmark');
			link.setAttribute('title', 'View In Frame');
			link.appendChild(document.createTextNode(bullet));
			result.appendChild(link);
		}
		var link = document.createElement("A");
		link.setAttribute('href', href);
		link.setAttribute('target', 'main');
		link.setAttribute('class', item.type);
		link.setAttribute('title', item.title);
		link.appendChild(document.createTextNode(item.type == 'bookmark' ? bullet + item.title : item.title));
		result.appendChild(link);
		wrapper.appendChild(result);
	},

	clearResult: function() {
        var result = document.getElementById("result"), child;
        while ((child = result.firstChild)) result.removeChild(child);
	},

	addMsg: function(msg) {
		var wrapper = document.getElementById("result");
		var result = document.createElement("LI");
		result.appendChild(document.createTextNode(msg));
		wrapper.appendChild(result);
	},

	escapeRegExp : function(str) {
		return str.replace(/([\*\+\?\.\^\/\$\\\|\[\]\{\}\(\)])/g, "\\$1");
	}
};
