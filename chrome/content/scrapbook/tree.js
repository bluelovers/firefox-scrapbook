
var sbTreeHandler = {

	get resource()
	{
		if ( this.TREE.view.selection.count < 1 )
			return null;
		else
			return this.TREE.builderView.getResourceAtIndex(this.TREE.currentIndex);
	},

	TREE : null,

	autoCollapse : false,

	init : function(isContainer, xulID)
	{
		if ( !xulID ) xulID = "sbTree";
		this.TREE = document.getElementById(xulID);
		this.TREE.database.AddDataSource(sbDataSource.data);
		this.autoCollapse = sbCommonUtils.getBoolPref("scrapbook.tree.autoCollapse", false);
		if ( isContainer ) document.getElementById("sbTreeRule").setAttribute("iscontainer", true);
		this.TREE.builder.rebuild();
	},


	onClick : function(aEvent, aType)
	{
		if ( aEvent.button != 0 && aEvent.button != 1 ) return;
		var obj = {};
		this.TREE.treeBoxObject.getCellAt(aEvent.clientX, aEvent.clientY, {}, {}, obj);
		if ( !obj.value || obj.value == "twisty" ) return;
		var curIdx = this.TREE.currentIndex;
		if ( this.TREE.view.isContainer(curIdx) )
		{
			this.toggleFolder(curIdx);
			if ( aType > 0 && ( aEvent.button == 1 || sbListHandler.enabled ) ) sbListHandler.init(this.resource);
		}
		else
		{
			if ( aType < 2 && aEvent.button != 1 ) return;
			sbController.open(this.resource, aEvent.button == 1 || aEvent.ctrlKey || aEvent.shiftKey);
		}
	},

	onKeyPress : function(aEvent)
	{
		switch ( aEvent.keyCode )
		{
			case aEvent.DOM_VK_RETURN : 
				if ( this.TREE.view.isContainer(this.TREE.currentIndex) ) return;
				sbController.open(this.resource, aEvent.ctrlKey || aEvent.shiftKey);
				break;
			case aEvent.DOM_VK_DELETE : this.remove(); break;
			case aEvent.DOM_VK_F2 : sbController.forward(this.resource, "P"); break;
		}
	},

	onDblClick : function(aEvent)
	{
		if ( aEvent.originalTarget.localName != "treechildren" || aEvent.button != 0 ) return;
		if ( this.TREE.view.isContainer(this.TREE.currentIndex) ) return;
		sbController.open(this.resource, aEvent.ctrlKey || aEvent.shiftKey);
	},


	send : function()
	{
		var idxList = this.getSelection(false, 2);
		if ( idxList.length < 1 ) return;
		if ( this.validateMultipleSelection(idxList) == false ) return;
		var i = 0;
		var resList = [];
		var parList = [];
		for ( i = 0; i < idxList.length; i++ )
		{
			var curRes = this.TREE.builderView.getResourceAtIndex(idxList[i]);
			var parRes = this.getParentResource(idxList[i]);
			if ( parRes.Value == "urn:scrapbook:search" )
			{
				parRes = sbDataSource.findParentResource(curRes);
				if ( sbCommonUtils.RDFCU.indexOf(sbDataSource.data, parRes, curRes) == -1 ) { alert("ScrapBook FATAL ERROR."); return; }
			}
			resList.push(curRes);
			parList.push(parRes);
		}
		sbController.sendInternal(resList, parList);
	},

	remove : function()
	{
		if ( this.TREE.view.selection.count == 0 ) return;
		if ( !sbController.confirmRemovingFor(this.resource) ) return;
		var resList = [];
		var parList = [];
		if ( this.TREE.view.selection.count > 1 )
		{
			var idxList = this.getSelection(false, 2);
			if ( idxList.length < 1 ) return;
			if ( this.validateMultipleSelection(idxList) == false ) return;
			for ( var i = 0; i < idxList.length; i++ )
			{
				resList.push( this.TREE.builderView.getResourceAtIndex(idxList[i]) );
				parList.push( this.getParentResource(idxList[i]) );
			}
		}
		else
		{
			var curIdx = this.TREE.currentIndex;
			var curRes = this.TREE.builderView.getResourceAtIndex(curIdx);
			var parRes = this.getParentResource(curIdx);
			if ( parRes.Value == "urn:scrapbook:search" )
			{
				sbDataSource.removeElementFromContainer("urn:scrapbook:search", curRes);
				parRes = sbDataSource.findParentResource(curRes);
				if ( sbCommonUtils.RDFCU.indexOf(sbDataSource.data, parRes, curRes) == -1 ) { alert("ScrapBook FATAL ERROR."); return; }
			}
			resList.push(curRes);
			parList.push(parRes);
		}
		var rmIDs = sbController.removeInternal(resList, parList, false);
		if ( rmIDs )
		{
			sbStatusHandler.trace(sbMainService.STRING.getFormattedString("ITEMS_REMOVED", [rmIDs.length]));
			if ( "sbNoteService" in window && sbNoteService.resource && sbNoteService.resource.Value.substring(18,32) == rmIDs[0] ) sbNoteService.exit(false);
		}
	},


	getParentResource : function(aIdx)
	{
		var parIdx = this.TREE.builderView.getParentIndex(aIdx);
		if ( parIdx == -1 )
			return this.TREE.resource;
		else
			return this.TREE.builderView.getResourceAtIndex(parIdx);
	},

	getSelection : function(idx2res, rule)
	{
		var ret = [];
		for ( var rc = 0; rc < this.TREE.view.selection.getRangeCount(); rc++ )
		{
			var start = {}, end = {};
			this.TREE.view.selection.getRangeAt(rc, start, end);
			for ( var i = start.value; i <= end.value; i++ )
			{
				if ( rule == 1 && !this.TREE.view.isContainer(i) ) continue;
				if ( rule == 2 && this.TREE.view.isContainer(i) ) continue;
				ret.push( idx2res ? this.TREE.builderView.getResourceAtIndex(i) : i );
			}
		}
		return ret;
	},

	validateMultipleSelection : function(aIdxList)
	{
		if ( aIdxList.length != this.TREE.view.selection.count )
		{
			alert(sbMainService.STRING.getString("ERROR_MULTIPLE_SELECTION"));
			return false;
		}
		return true;
	},

	toggleFolder : function(aIdx)
	{
		if ( !aIdx ) aIdx = this.TREE.currentIndex;
		this.TREE.view.toggleOpenState(aIdx);
		if ( this.autoCollapse ) this.collapseFoldersBut(aIdx);
	},

	toggleAllFolders : function(forceClose)
	{
		var willOpen = true;
		for ( var i = 0; i < this.TREE.view.rowCount; i++ )
		{
			if ( !this.TREE.view.isContainer(i) ) continue;
			if ( this.TREE.view.isContainerOpen(i) ) { willOpen = false; break; }
		}
		if ( forceClose ) willOpen = false;
		if ( willOpen ) {
			for ( var i = 0; i < this.TREE.view.rowCount; i++ )
			{
				if ( this.TREE.view.isContainer(i) && !this.TREE.view.isContainerOpen(i) ) this.TREE.view.toggleOpenState(i);
			}
		} else {
			for ( var i = this.TREE.view.rowCount - 1; i >= 0; i-- )
			{
				if ( this.TREE.view.isContainer(i) && this.TREE.view.isContainerOpen(i) ) this.TREE.view.toggleOpenState(i);
			}
		}
	},

	collapseFoldersBut : function(curIdx)
	{
		var ascIdxList = {};
		ascIdxList[curIdx] = true;
		while ( curIdx >= 0 )
		{
			curIdx = this.TREE.builderView.getParentIndex(curIdx);
			ascIdxList[curIdx] = true;
		}
		for ( var i = this.TREE.view.rowCount - 1; i >= 0; i-- )
		{
			if ( !ascIdxList[i] && this.TREE.view.isContainer(i) && this.TREE.view.isContainerOpen(i) ) {
				this.TREE.view.toggleOpenState(i);
			}
		}
	},

};




var sbListHandler = {

	get LIST() { return document.getElementById("sbList"); },
	get OBSERVER() { return document.getElementById("sbToggleListView"); },

	get enabled()
	{
		return this.OBSERVER.getAttribute("checked") == "true";
	},

	get resource()
	{
		if ( !this.LIST.selectedItem )
			return null;
		else
			return sbCommonUtils.RDF.GetResource(this.LIST.selectedItem.id);
	},

	init : function(aRes)
	{
		if ( !aRes)
		{
			if ( sbTreeHandler.TREE.view.selection.count < 1 ) {
				aRes = sbTreeHandler.TREE.resource;
			} else if ( sbTreeHandler.TREE.view.isContainer(sbTreeHandler.TREE.currentIndex) ) {
				aRes = sbTreeHandler.resource;
			} else {
				aRes = sbTreeHandler.getParentResource(sbTreeHandler.TREE.currentIndex);
			}
		}
		if ( aRes.Value == "urn:scrapbook:search" ) return;
		document.getElementById("sbTreeRule").setAttribute("iscontainer", "true");
		sbTreeHandler.TREE.builder.rebuild();
		var title = aRes.Value == "urn:scrapbook:root" ? sbMainService.STRING.getString("ROOT_FOLDER") : sbDataSource.getProperty(aRes, "title");
		document.getElementById("sbListHeader").firstChild.value = title;
		document.getElementById("sbListMoveUpButton").hidden = aRes.Value == "urn:scrapbook:root";
		this.LIST.parentNode.hidden = false;
		document.getElementById("sbListSplitter").hidden = false;
		if ( !this.LIST.ref )
		{
			this.LIST.database.AddDataSource(sbDataSource.data);
			this.refresh(false);
		}
		this.LIST.ref = aRes.Value;
		this.LIST.clearSelection();
		this.LIST.scrollBoxObject.scrollToLine(0);
		this.OBSERVER.setAttribute("checked", "true");
		this.OBSERVER.setAttribute("lastRef", aRes.Value);
		this.onAfterRefresh();
	},

	exit : function(aWillLocate)
	{
		if ( !this.enabled ) return;
		document.getElementById("sbTreeRule").removeAttribute("iscontainer");
		sbTreeHandler.TREE.builder.rebuild();
		this.LIST.parentNode.hidden = true;
		document.getElementById("sbListSplitter").hidden = true;
		this.OBSERVER.removeAttribute("checked");
		this.OBSERVER.removeAttribute("lastRef");
		if ( aWillLocate ) sbMainService.locate(this.LIST.resource);
	},

	toggle : function()
	{
		this.enabled ? this.exit(true) : this.init(null);
	},

	goUpperLevel : function()
	{
		var upRes = sbDataSource.findParentResource(this.LIST.resource);
		if ( upRes && sbDataSource.exists(upRes) ) this.init(upRes);
	},

	restoreLastState : function()
	{
		if ( this.enabled )
		{
			var lastRes = sbCommonUtils.RDF.GetResource(this.OBSERVER.getAttribute("lastRef"));
			if ( lastRes && sbDataSource.exists(lastRes) ) this.init(lastRes);
		}
	},

	refresh : function(aShouldRebuild)
	{
		document.getElementById("sbListTemplateSource").hidden  = !document.getElementById("sbListToggleSource").getAttribute("checked");
		document.getElementById("sbListTemplateComment").hidden = !document.getElementById("sbListToggleComment").getAttribute("checked");
		if ( aShouldRebuild )
		{
			this.LIST.builder.rebuild();
			this.LIST.clearSelection();
			this.LIST.scrollBoxObject.scrollToLine(0);
		}
		this.onAfterRefresh();
	},

	onAfterRefresh : function() {},


	onClick : function(aEvent)
	{
		if ( aEvent.button != 0 && aEvent.button != 1 ) return;
		sbController.open(this.resource, aEvent.button == 1 || aEvent.ctrlKey || aEvent.shiftKey);
	},

	onKeyPress : function(aEvent)
	{
		switch ( aEvent.keyCode )
		{
			case aEvent.DOM_VK_RETURN : sbController.open(this.resource, aEvent.ctrlKey || aEvent.shiftKey); break;
			case aEvent.DOM_VK_DELETE : this.doCommand("remove"); break;
			case aEvent.DOM_VK_F2     : sbController.forward(this.resource, "P"); break;
		}
	},


	doCommand : function(aCommand)
	{
		if ( !this.resource ) return;
		switch ( aCommand )
		{
			case "send" :
				sbController.sendInternal([this.resource], [this.LIST.resource]);
				break;
			case "remove" :
				if ( !sbController.confirmRemovingFor(this.resource) ) return;
				sbController.removeInternal([this.resource], [this.LIST.resource], false);
				break;
		}
	},

};


