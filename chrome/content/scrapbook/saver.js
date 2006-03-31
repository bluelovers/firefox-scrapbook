
var sbContentSaver = {


	name         : "",
	item         : null,
	contentDir   : null,
	httpTask     : {},
	file2URL     : {},
	option       : {},
	refURLObj    : null,
	favicon      : null,
	frameList    : null,
	frameNumber  : 0,
	selection    : null,
	linkURLs     : [],


	getFrameList : function(aWindow)
	{
		for ( var f=0; f<aWindow.frames.length; f++ )
		{
			this.frameList.push(aWindow.frames[f]);
			this.getFrameList(aWindow.frames[f]);
		}
	},

	init : function(aPresetData)
	{
		this.item = new ScrapBookItem(sbDataSource.identify(sbCommonUtils.getTimeStamp()));
		this.name = "index";
		this.favicon = null;
		this.file2URL = { "index.html" : true, "index.css" : true, "index.dat" : true, "index.png" : true, "sitemap.xml" : true, "sb-file2url.txt" : true, "sb-url2name.txt" : true, };
		this.option   = { "dlimg" : false, "dlsnd" : false, "dlmov" : false, "dlarc" : false, "custom" : "", "inDepth" : 0, "isPartial" : false, "images" : true, "styles" : true, "script" : false };
		this.linkURLs = [];
		this.frameList   = [];
		this.frameNumber = 0;
		if ( aPresetData )
		{
			if ( aPresetData[0] ) this.item.id  = aPresetData[0];
			if ( aPresetData[1] ) this.name     = aPresetData[1];
			if ( aPresetData[2] ) this.option   = aPresetData[2];
			if ( aPresetData[3] ) this.file2URL = aPresetData[3];
			if ( aPresetData[4] >= this.option["inDepth"] ) this.option["inDepth"] = 0;
		}
		this.option["encodeUTF8"] = sbCommonUtils.getBoolPref("scrapbook.capture.encodeUTF8", true);
		this.httpTask[this.item.id] = 0;
	},

	captureWindow : function(aRootWindow, aIsPartial, aShowDetail, aResName, aResIndex, aPresetData, aContext)
	{
		if ( !sbDataSource.data ) sbDataSource.init();
		this.init(aPresetData);
		this.item.chars  = aRootWindow.document.characterSet;
		this.item.source = aRootWindow.location.href;
		try { this.item.icon = gBrowser.selectedTab.getAttribute("image"); } catch(ex) {}

		this.getFrameList(aRootWindow);

		var titleList = aRootWindow.document.title && typeof(aRootWindow.document.title) == "string" ? [aRootWindow.document.title] : [this.item.source];
		if ( aIsPartial )
		{
			this.selection = aRootWindow.getSelection();
			var lines = this.selection.toString().split("\n");
			for ( var i = 0; i < lines.length; i++ )
			{
				lines[i] = lines[i].replace(/\r|\n|\t/g, "");
				if ( lines[i].length > 0 ) titleList.push(lines[i].substring(0,72));
				if ( titleList.length > 4 ) break;
			}
			this.item.title = ( titleList.length > 0 ) ? titleList[1] : titleList[0];
		}
		else
		{
			this.selection = null;
			this.item.title = titleList[0];
		}

		if ( aShowDetail )
		{
			var ret = this.showDetailDialog(titleList, aResName, aContext);
			if ( ret.change ) { aResName = ret.resName; aResIndex = 0; }
			if ( ret.cancel ) { return null; }
		}

		this.contentDir = sbCommonUtils.getContentDir(this.item.id);

		this.saveDocumentInternal(aRootWindow.document, this.name);

		if ( this.item.icon && this.item.type != "image" && this.item.type != "file" )
		{
			var iconFileName = this.download(this.item.icon);
			this.favicon = iconFileName;
		}

		if ( this.httpTask[this.item.id] == 0 )
		{
			setTimeout(function(){ sbCaptureObserverCallback.onCaptureComplete(sbContentSaver.item); }, 100);
		}

		if ( this.option["inDepth"] > 0 && this.linkURLs.length > 0 )
		{
			if ( !aPresetData || aContext == "renew" )
			{
				this.item.type = "marked";
				this.option["isPartial"] = aIsPartial;
				window.openDialog(
					"chrome://scrapbook/content/capture.xul", "", "chrome,centerscreen,all,dialog=no",
					this.linkURLs, this.refURLObj.spec,
					false, null, 0,
					this.item, this.option, this.file2URL
				);
			}
			else
			{
				for ( var i = 0; i < this.linkURLs.length; i++ )
				{
					sbCaptureTask.add(this.linkURLs[i], aPresetData[4] + 1);
				}
			}
		}

		this.addResource(aResName, aResIndex);

		return [this.name, this.file2URL];
	},


	captureFile : function(aSourceURL, aReferURL, aType, aShowDetail, aResName, aResIndex, aPresetData, aContext)
	{
		if ( !sbDataSource.data ) sbDataSource.init();
		this.init(aPresetData);
		this.item.title  = sbCommonUtils.getFileName(aSourceURL);
		this.item.icon   = "moz-icon://" + this.item.title + "?size=16";
		this.item.source = aSourceURL;
		this.item.type   = aType;
		if ( aShowDetail )
		{
			var ret = this.showDetailDialog([this.item.title], aResName, aContext);
			if ( ret.change ) { aResName = ret.resName; aResIndex = 0; }
			if ( ret.cancel ) { return null; }
		}
		this.contentDir = sbCommonUtils.getContentDir(this.item.id);
		this.refURLObj  = sbCommonUtils.convertURLToObject(aReferURL);
		this.saveFileInternal(aSourceURL, this.name, aType);
		this.addResource(aResName, aResIndex);
		return [this.name, this.file2URL];
	},


	showDetailDialog : function(aTitleList, aResName, aContext)
	{
		var ret = {
			titleList : aTitleList,
			resName   : aResName,
			cancel    : false,
			change    : false,
			context   : aContext
		};
		window.openDialog("chrome://scrapbook/content/detail.xul" + (aContext ? "?capture" : ""), "", "chrome,modal,centerscreen,resizable", ret);
		return ret;
	},


	saveDocumentInternal : function(aDocument, aFileKey)
	{
		if ( !aDocument.body || !aDocument.contentType.match(/html|xml/i) )
		{
			var captureType = (aDocument.contentType.substring(0,5) == "image") ? "image" : "file";
			if ( this.frameNumber == 0 ) this.item.type = captureType;
			var newLeafName = this.saveFileInternal(aDocument.location.href, aFileKey, captureType);
			return newLeafName;
		}

		this.refURLObj = sbCommonUtils.convertURLToObject(aDocument.location.href);


		if ( this.selection )
		{
			var myRange = this.selection.getRangeAt(0);
			var myDocFrag = myRange.cloneContents();
			var curNode = myRange.commonAncestorContainer;
			if ( curNode.nodeName == "#text" ) curNode = curNode.parentNode;
		}

		var tmpNodeList = [];
		if ( this.selection )
		{
			do {
				tmpNodeList.unshift(curNode.cloneNode(false));
				curNode = curNode.parentNode;
			}
			while ( curNode.nodeName.toUpperCase() != "HTML" );
		}
		else
		{
			tmpNodeList.unshift(aDocument.body.cloneNode(true));
		}

		var rootNode = aDocument.getElementsByTagName("html")[0].cloneNode(false);

		try {
			var headNode = aDocument.getElementsByTagName("head")[0].cloneNode(true);
			rootNode.appendChild(headNode);
			rootNode.appendChild(document.createTextNode("\n"));
		} catch(ex) {
		}

		rootNode.appendChild(tmpNodeList[0]);
		rootNode.appendChild(document.createTextNode("\n"));
		for ( var n = 0; n < tmpNodeList.length-1; n++ )
		{
			tmpNodeList[n].appendChild(document.createTextNode("\n"));
			tmpNodeList[n].appendChild(tmpNodeList[n+1]);
			tmpNodeList[n].appendChild(document.createTextNode("\n"));
		}

		if ( this.selection )
		{
			this.addCommentTag(tmpNodeList[tmpNodeList.length-1], "DOCUMENT_FRAGMENT");
			tmpNodeList[tmpNodeList.length-1].appendChild(myDocFrag);
			this.addCommentTag(tmpNodeList[tmpNodeList.length-1], "/DOCUMENT_FRAGMENT");
		}


		this.processDOMRecursively(rootNode);


		var myCSS = "";
		if ( this.option["styles"] )
		{
			var myStyleSheets = aDocument.styleSheets;
			for ( var i=0; i<myStyleSheets.length; i++ )
			{
				myCSS += this.processCSSRecursively(myStyleSheets[i]);
			}
			if ( myCSS )
			{
				var newLinkNode = document.createElement("link");
				newLinkNode.setAttribute("media", "all");
				newLinkNode.setAttribute("href", aFileKey + ".css");
				newLinkNode.setAttribute("type", "text/css");
				newLinkNode.setAttribute("rel", "stylesheet");
				rootNode.firstChild.appendChild(document.createTextNode("\n"));
				rootNode.firstChild.appendChild(newLinkNode);
				rootNode.firstChild.appendChild(document.createTextNode("\n"));
				myCSS = myCSS.replace(/\*\|/g, "");
			}
		}


		if ( this.option["encodeUTF8"] )
		{
			this.item.chars = "UTF-8";
			var metaNode = document.createElement("meta");
			metaNode.setAttribute("content", aDocument.contentType + "; charset=" + this.item.chars);
			metaNode.setAttribute("http-equiv", "Content-Type");
			rootNode.firstChild.insertBefore(document.createTextNode("\n"), rootNode.firstChild.firstChild);
			rootNode.firstChild.insertBefore(metaNode, rootNode.firstChild.firstChild);
			rootNode.firstChild.insertBefore(document.createTextNode("\n"), rootNode.firstChild.firstChild);
		}


		var myHTML;
		myHTML = this.surroundByTags(rootNode, rootNode.innerHTML);
		myHTML = this.doctypeToString(aDocument.doctype) + myHTML;
		myHTML = myHTML.replace(/\x00/g, " ");

		var myHTMLFile = this.contentDir.clone();
		myHTMLFile.append(aFileKey + ".html");
		sbCommonUtils.writeFile(myHTMLFile, myHTML, this.item.chars);

		if ( myCSS )
		{
			var myCSSFile = this.contentDir.clone();
			myCSSFile.append(aFileKey + ".css");
			sbCommonUtils.writeFile(myCSSFile, myCSS, this.item.chars);
		}

		return myHTMLFile.leafName;
	},


	saveFileInternal : function(aFileURL, aFileKey, aCaptureType)
	{
		if ( !aFileKey ) aFileKey = "file" + Math.random().toString();

		if ( !this.refURLObj ) this.refURLObj = sbCommonUtils.convertURLToObject(aFileURL);


		if ( this.frameNumber == 0 )
		{
			this.item.icon  = "moz-icon://" + sbCommonUtils.getFileName(aFileURL) + "?size=16";
			this.item.type  = aCaptureType;
			this.item.chars = "";
		}

		var newFileName = this.download(aFileURL);

		if ( aCaptureType == "image" ) {
			var myHTML = '<html><body><img src="' + newFileName + '"></body></html>';
		} else {
			var myHTML = '<html><head><meta http-equiv="refresh" content="0;URL=./' + newFileName + '"></head><body></body></html>';
		}
		var myHTMLFile = this.contentDir.clone();
		myHTMLFile.append(aFileKey + ".html");
		sbCommonUtils.writeFile(myHTMLFile, myHTML, "UTF-8");

		return myHTMLFile.leafName;
	},


	addResource : function(aResName, aResIndex)
	{
		if ( !aResName ) return;
		var myRes = sbDataSource.addItem(this.item, aResName, aResIndex);
		sbCommonUtils.rebuildGlobal();
		if ( this.favicon )
		{
			var iconURL = "resource://scrapbook/data/" + this.item.id + "/" + this.favicon;
			setTimeout(function(){
				sbDataSource.setProperty(myRes, "icon", iconURL); sbDataSource.flush();
			}, 500);
			this.item.icon = this.favicon;
		}
		sbCommonUtils.writeIndexDat(this.item);
	},



	surroundByTags : function(aNode, aContent)
	{
		var tag = "<" + aNode.nodeName.toLowerCase();
		for ( var i=0; i<aNode.attributes.length; i++ )
		{
			tag += ' ' + aNode.attributes[i].name + '="' + aNode.attributes[i].value + '"';
		}
		tag += ">\n";
		return tag + aContent + "</" + aNode.nodeName.toLowerCase() + ">\n";
	},


	addCommentTag : function(targetNode, aComment)
	{
		targetNode.appendChild(document.createTextNode("\n"));
		targetNode.appendChild(document.createComment(aComment));
		targetNode.appendChild(document.createTextNode("\n"));
	},


	removeNodeFromParent : function(aNode)
	{
		var newNode = document.createTextNode("");
		aNode.parentNode.replaceChild(newNode, aNode);
		aNode = newNode;
		return aNode;
	},


	doctypeToString : function(aDoctype)
	{
		if ( !aDoctype ) return "";
		var ret = "<!DOCTYPE " + aDoctype.name;
		if ( aDoctype.publicId ) ret += ' PUBLIC "' + aDoctype.publicId + '"';
		if ( aDoctype.systemId ) ret += ' "'        + aDoctype.systemId + '"';
		ret += ">\n";
		return ret;
	},



	processDOMRecursively : function(rootNode)
	{
		for ( var curNode = rootNode.firstChild; curNode != null; curNode = curNode.nextSibling )
		{
			if ( curNode.nodeName == "#text" || curNode.nodeName == "#comment" ) continue;
			curNode = this.inspectNode(curNode);
			this.processDOMRecursively(curNode);
		}
	},


	inspectNode : function(aNode)
	{
		switch ( aNode.nodeName.toLowerCase() )
		{
			case "img" : 
			case "embed" : 
				if ( this.option["images"] ) {
					if ( aNode.hasAttribute("onclick") ) aNode = this.normalizeJavaScriptLink(aNode, "onclick");
					var aFileName = this.download(aNode.src);
					if (aFileName) aNode.setAttribute("src", aFileName);
				} else {
					return this.removeNodeFromParent(aNode);
				}
				break;
			case "object" : 
				if ( this.option["images"] ) {
					var aFileName = this.download(aNode.data);
					if (aFileName) aNode.setAttribute("data", aFileName);
				} else {
					return this.removeNodeFromParent(aNode);
				}
				break;
			case "body" : 
				if ( this.option["images"] ) {
					var aFileName = this.download(aNode.background);
					if (aFileName) aNode.setAttribute("background", aFileName);
				} else {
					aNode.removeAttribute("background");
					aNode.removeAttribute("bgcolor");
					aNode.removeAttribute("text");
				}
				break;
			case "table" : 
			case "tr" : 
			case "th" : 
			case "td" : 
				if ( this.option["images"] ) {
					var aFileName = this.download(aNode.getAttribute("background"));
					if (aFileName) aNode.setAttribute("background", aFileName);
				} else {
					aNode.removeAttribute("background");
					aNode.removeAttribute("bgcolor");
				}
				break;
			case "input" : 
				if ( aNode.type.toLowerCase() == "image" ) {
					if ( this.option["images"] ) {
						var aFileName = this.download(aNode.src);
						if (aFileName) aNode.setAttribute("src", aFileName);
					} else {
						aNode.removeAttribute("src");
						aNode.setAttribute("type", "button");
						if ( aNode.hasAttribute("alt") ) aNode.setAttribute("value", aNode.getAttribute("alt"));
					}
				}
				break;
			case "link" : 
				if ( aNode.rel.toLowerCase() == "stylesheet" && (aNode.href.indexOf("chrome") != 0 || !this.option["styles"]) ) {
					return this.removeNodeFromParent(aNode);
				} else if ( aNode.rel.toLowerCase() == "shortcut icon" || aNode.rel.toLowerCase() == "icon" ) {
					var aFileName = this.download(aNode.href);
					if (aFileName) aNode.setAttribute("href", aFileName);
					if ( this.frameNumber == 0 && !this.favicon ) this.favicon = aFileName;
				} else {
					aNode.setAttribute("href", aNode.href);
				}
				break;
			case "base" : 
			case "style" : 
				return this.removeNodeFromParent(aNode);
				break;
			case "script" : 
			case "noscript" : 
				if ( this.option["script"] ) {
					if ( aNode.hasAttribute("src") ) {
						var aFileName = this.download(aNode.src);
						if (aFileName) aNode.setAttribute("src", aFileName);
					}
				} else {
					return this.removeNodeFromParent(aNode);
				}
				break;
			case "a" : 
			case "area" : 
				if ( aNode.hasAttribute("onclick") ) aNode = this.normalizeJavaScriptLink(aNode, "onclick");
				if ( !aNode.hasAttribute("href") ) return aNode;
				if ( aNode.target == "_blank" ) aNode.setAttribute("target", "_top");
				if ( aNode.href.match(/^javascript:/i) ) aNode = this.normalizeJavaScriptLink(aNode, "href");
				if ( !this.selection && aNode.getAttribute("href").charAt(0) == "#" ) return aNode;
				var ext = sbCommonUtils.splitFileName(sbCommonUtils.getFileName(aNode.href))[1].toLowerCase();
				var flag = false;
				switch ( ext )
				{
					case "jpg" : case "jpeg" : case "png" : case "gif" : flag = this.option["dlimg"]; break;
					case "mp3" : case "wav"  : case "ram" : case "wma" : flag = this.option["dlsnd"]; break;
					case "mpg" : case "mpeg" : case "avi" : 
					case "ram" : case "rm"   : case "mov" : case "wmv" : flag = this.option["dlmov"]; break;
					case "zip" : case "lzh"  : case "rar" :	case "xpi" : flag = this.option["dlarc"]; break;
					default :
						if ( ext && this.option["custom"] )
						{
							if ( (", " + this.option["custom"] + ", ").indexOf(", " + ext + ", ") != -1 ) flag = true;
						}
						if ( !flag && this.option["inDepth"] > 0 ) this.linkURLs.push(aNode.href);
				}
				if ( aNode.href.indexOf("file://") == 0 && !aNode.href.match(/\.html$/) ) flag = true;
				if ( flag ) {
					var aFileName = this.download(aNode.href);
					if (aFileName) aNode.setAttribute("href", aFileName);
				} else {
					aNode.setAttribute("href", aNode.href);
				}
				break;
			case "form" : 
				aNode.setAttribute("action", sbCommonUtils.resolveURL(this.refURLObj.spec, aNode.action));
				break;
			case "meta" : 
				if ( this.option["encodeUTF8"] )
				{
					if ( aNode.hasAttribute("http-equiv") && aNode.hasAttribute("content") &&
					     aNode.getAttribute("http-equiv").toLowerCase() == "content-type" && 
					     aNode.getAttribute("content").match(/charset\=/i) )
					{
						return this.removeNodeFromParent(aNode);
					}
				}
				break;
			case "frame"  : 
			case "iframe" : 
				if ( this.selection ) {
					aNode.setAttribute("src", aNode.src);
					break;
				}
				var tmpRefURL = this.refURLObj;
				try {
					var newFileName = this.saveDocumentInternal(this.frameList[this.frameNumber++].document, this.name + "_" + this.frameNumber);
					aNode.setAttribute("src", newFileName);
				} catch(ex) {
					alert("ScrapBook ERROR: Failed to get document in a frame.");
				}
				this.refURLObj = tmpRefURL;
				break;
		}
		if ( !this.option["styles"] )
		{
			aNode.removeAttribute("style");
		}
		else if ( aNode.style && aNode.style.cssText )
		{
			var newCSStext = this.inspectCSSText(aNode.style.cssText, this.refURLObj.spec);
			if ( newCSStext ) aNode.setAttribute("style", newCSStext);
		}
		if ( !this.option["script"] )
		{
			aNode.removeAttribute("onmouseover");
			aNode.removeAttribute("onmouseout");
			aNode.removeAttribute("onload");
		}
		return aNode;
	},


	processCSSRecursively : function(aCSS)
	{
		var content = "";

		if ( aCSS.disabled ) return "";
		var medium = aCSS.media.mediaText;
		if ( medium != "" && medium.indexOf("screen") < 0 && medium.indexOf("all") < 0 )
		{
			return "";
		}
		if ( aCSS.href.indexOf("chrome") == 0 ) return "";
		var flag = false;
		for ( var i=0; i<aCSS.cssRules.length; i++ )
		{
			if ( aCSS.cssRules[i].type == 1 || aCSS.cssRules[i].type == 4 )
			{
				if ( !flag ) { content += "\n/* ::::: " + aCSS.href + " ::::: */\n\n"; flag = true; }
				content += this.inspectCSSText(aCSS.cssRules[i].cssText, aCSS.href) + "\n";
			}
			else if ( aCSS.cssRules[i].type == 3 )
			{
				content += this.processCSSRecursively(aCSS.cssRules[i].styleSheet);
			}
		}
		return content;
	},


	inspectCSSText : function(aCSStext, aCSShref)
	{
		if ( !aCSStext ) return "";
		var re = new RegExp(/ url\(([^\'\)\s]+)\)/);
		var i = 0;
		while ( aCSStext.match(re) )
		{
			if ( ++i > 10 ) break;
			var imgURL  = sbCommonUtils.resolveURL(aCSShref, RegExp.$1);
			var imgFile = this.option["images"] ? this.download(imgURL) : "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAEALAAAAAABAAEAAAIBTAA7";
			aCSStext = aCSStext.replace(re, " url('" + imgFile + "')");
		}
		aCSStext = aCSStext.replace(/([^\{\}])(\r|\n)/g, "$1\\A");
		re = new RegExp(/ content: \"(.*?)\"; /);
		if ( aCSStext.match(re) )
		{
			var innerQuote = RegExp.$1;
			innerQuote = innerQuote.replace(/\"/g, '\\"');
			innerQuote = innerQuote.replace(/\\\" attr\(([^\)]+)\) \\\"/g, '" attr($1) "');
			aCSStext = aCSStext.replace(re, ' content: "' + innerQuote + '"; ');
		}
		if ( aCSStext.match(/ (quotes|voice-family): \"/) )
		{
			return "";
		}
		if ( aCSStext.match(/ background: /i) )
		{
			aCSStext = aCSStext.replace(/ -moz-background-[^:]+: -moz-[^;]+;/g, "");
			aCSStext = aCSStext.replace(/ scroll 0(pt|px|%);/g, ";");
		}
		return aCSStext;
	},


	download : function(aURLSpec)
	{
		if ( !aURLSpec ) return;

		if ( aURLSpec.indexOf("://") < 0 )
		{
			aURLSpec = sbCommonUtils.resolveURL(this.refURLObj.spec, aURLSpec);
		}

		try {
			var aURL = Components.classes['@mozilla.org/network/standard-url;1'].createInstance(Components.interfaces.nsIURL);
			aURL.spec = aURLSpec;
		} catch(ex) {
			alert("ScrapBook ERROR: Failed to download: " + aURLSpec);
			return;
		}
		var newFileName = aURL.fileName.toLowerCase();

		if ( !newFileName ) newFileName = "untitled";
		newFileName = sbCommonUtils.validateFileName(newFileName);

		if ( this.file2URL[newFileName] == undefined )
		{
		}
		else if ( this.file2URL[newFileName] != aURLSpec )
		{
			var seq = 1;
			var fileLR = sbCommonUtils.splitFileName(newFileName);
			if ( !fileLR[1] ) fileLR[1] = "dat";
			newFileName = fileLR[0] + "_" + this.leftZeroPad3(seq) + "." + fileLR[1];
			while ( this.file2URL[newFileName] != undefined )
			{
				if ( this.file2URL[newFileName] == aURLSpec )
				{
					return newFileName;
				}
				newFileName = fileLR[0] + "_" + this.leftZeroPad3(++seq) + "." + fileLR[1];
			}
		}
		else
		{
			return newFileName;
		}

		if ( aURL.schemeIs("http") || aURL.schemeIs("https") || aURL.schemeIs("ftp") )
		{
			var targetFile = this.contentDir.clone();
			targetFile.append(newFileName);
			try {
				var WBP = Components.classes['@mozilla.org/embedding/browser/nsWebBrowserPersist;1'].createInstance(Components.interfaces.nsIWebBrowserPersist);
				WBP.persistFlags |= WBP.PERSIST_FLAGS_FROM_CACHE;
				WBP.saveURI(aURL, null, this.refURLObj, null, null, targetFile);
				this.httpTask[this.item.id]++;
				WBP.progressListener = new sbCaptureObserver(this.item, newFileName);
				this.file2URL[newFileName] = aURLSpec;
				return newFileName;
			}
			catch(ex) {
				dump("*** SCRAPBOOK_PERSIST_FAILURE: " + aURLSpec + "\n" + ex + "\n");
				this.httpTask[this.item.id]--;
				return "";
			}
		}
		else if ( aURL.schemeIs("file") )
		{
			var targetDir = this.contentDir.clone();
			try {
				var orgFile = sbCommonUtils.convertURLToFile(aURLSpec);
				if ( !orgFile.isFile() ) return;
				orgFile.copyTo(targetDir, newFileName);
				this.file2URL[newFileName] = aURLSpec;
				return newFileName;
			}
			catch(ex) {
				dump("*** SCRAPBOOK_COPY_FAILURE: " + aURLSpec + "\n" + ex + "\n");
				return "";
			}
		}
	},


	leftZeroPad3 : function(num)
	{
		if ( num < 10 ) { return "00" + num; } else if ( num < 100 ) { return "0" + num; } else { return num; }
	},


	normalizeJavaScriptLink : function(aNode, aAttr)
	{
		var val = aNode.getAttribute(aAttr);
		if ( !val.match(/\(\'([^\']+)\'/) ) return aNode;
		val = RegExp.$1;
		if ( val.indexOf("/") == -1 && val.indexOf(".") == -1 ) return aNode;
		val = sbCommonUtils.resolveURL(this.refURLObj.spec, val);
		if ( aNode.nodeName.toLowerCase() == "img" )
		{
			if ( aNode.parentNode.nodeName.toLowerCase() == "a" ) {
				aNode.parentNode.setAttribute("href", val);
				aNode.removeAttribute("onclick");
			} else {
				val = "window.open('" + val + "');";
				aNode.setAttribute(aAttr, val);
			}
		}
		else
		{
			if ( aNode.hasAttribute("href") && aNode.getAttribute("href").indexOf("http://") != 0 )
			{
				aNode.setAttribute("href", val);
				aNode.removeAttribute("onclick");
			}
		}
		return aNode;
	},


};




function sbCaptureObserver(aSBitem, aFileName)
{
	this.item     = aSBitem;
	this.fileName = aFileName;
	this.callback = sbCaptureObserverCallback;
}

sbCaptureObserver.prototype = {

	onStateChange : function(aWebProgress, aRequest, aStateFlags, aStatus)
	{
		if ( aStateFlags & Components.interfaces.nsIWebProgressListener.STATE_STOP )
		{
			if ( --sbContentSaver.httpTask[this.item.id] == 0 ) {
				this.callback.onAllDownloadsComplete(this.item);
			} else {
				this.callback.onDownloadComplete(this.item);
			}
		}
	},
	onProgressChange : function(aWebProgress, aRequest, aCurSelfProgress, aMaxSelfProgress, aCurTotalProgress, aMaxTotalProgress)
	{
		if ( aCurTotalProgress == aMaxTotalProgress ) return;
		var progress = (aMaxSelfProgress > 0) ? Math.round(aCurSelfProgress / aMaxSelfProgress * 100) + "%" : aCurSelfProgress + "Bytes";
		this.callback.onDownloadProgress(this.item, this.fileName, progress);
	},
	onStatusChange   : function() {},
	onLocationChange : function() {},
	onSecurityChange : function() {},
};


var sbCaptureObserverCallback = {

	onDownloadComplete : function(aItem)
	{
		try {
			top.window.document.getElementById("sidebar").contentWindow.sbStatusHandler.httpBusy(sbContentSaver.httpTask[aItem.id], aItem.title);
		} catch(ex) {
		}
	},

	onAllDownloadsComplete : function(aItem)
	{
		try {
			top.window.document.getElementById("sidebar").contentWindow.sbStatusHandler.httpComplete(aItem.title);
		} catch(ex) {
		}
		this.onCaptureComplete(aItem);
	},

	onDownloadProgress : function(aItem, aFileName, aProgress)
	{
		try {
			top.window.document.getElementById("sidebar").contentWindow.sbStatusHandler.httpBusy(sbContentSaver.httpTask[aItem.id], aProgress + " : " + aFileName);
		} catch(ex) {
		}
	},

	onCaptureComplete : function(aItem)
	{
		if ( aItem && sbDataSource.getProperty(sbCommonUtils.RDF.GetResource("urn:scrapbook:item" + aItem.id), "type") == "marked" ) return;
		if ( sbCommonUtils.getBoolPref("scrapbook.notifyOnComplete", true) )
		{
			window.openDialog("chrome://scrapbook/content/notify.xul", "", "alwaysRaised,dependent,titlebar=no", aItem);
		}
		if ( aItem && aItem.id in sbContentSaver.httpTask ) delete sbContentSaver.httpTask[aItem.id];
	},

};


