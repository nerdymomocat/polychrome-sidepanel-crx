let v = (nameObject) => { for(let varName in nameObject) { return varName; } }
var groupList = []
var activeSearchResults = [];

var activeQuery = undefined;
var activeQueryItems = undefined;
var selectedItemId;
var queryTab;
const SEARCH_PREFIX = "search:"


let tabRecents = [];
// chrome.tabs.onActivated.addListener( async info => {;
//   let tab = await chrome.tabs.get(info.tabId);
//   tabRecents.unshift(tab);
//   tabRecents.splice(4);
//   console.log("tabrecents", tab)
// })


// Stored Values
var autofocus = getDefault(v({autofocus}), false);
var preserveGroups = getDefault(v({preserveGroups}), true);
var simplifyTitles = getDefault(v({simplifyTitles}), true); 
var autofocusResults = getDefault(v({autofocusResults}), true);
var darkMode = getDefault(v({darkMode}), false); 

setTimeout(() => location.reload(), 60 * 1000 * 1000)

var isSearchMode = window.location.href.indexOf("search.html") > 0;

var myWindowId = undefined;
var lastWindowId = undefined;
var isMenuMode = false;
await chrome.tabs.getCurrent((sidebar) => {
  if (sidebar) {
    myWindowId = sidebar.windowId

    if (isSearchMode) {
     chrome.windows.update(myWindowId, {height:220});
      document.body.classList.add("search")
    }

  } else {
    isMenuMode = true;
    document.body.classList.add("menu")
  }
});



let queryTabHistory = [];

function queryTabHistoryAdd(item) {
  if (!queryTab) return;
  queryTabHistory.push(item);
  console.log("pushed", item)
}

function queryTabHistoryClear() {
  queryTabHistory.pop();

  for(let item of queryTabHistory) {
    if (item.visitCount == 1) {
      chrome.history.deleteUrl({url:item.url});
      console.log("clearing", item.url)
    }
  }
  queryTabHistory = [];
}

chrome.history.onVisited.addListener(queryTabHistoryAdd);

window.addEventListener('blur', windowBlurred);
window.addEventListener('focus', windowFocused);


let searchClearTimeout;
function windowBlurred() {
  searchClearTimeout = setTimeout(clearSearch, 3000)
}

function windowFocused() {
  clearTimeout(searchClearTimeout);
}

function clearSearchMode () {
  if (isSearchMode) {
    //chrome.windows.remove(myWindowId);
  } else {
    clearSearch();
  }
}

if (navigator.userAgent.indexOf("Windows") !== -1) {
  document.body.classList.add("windows")
}


function adjustColors() {
  let matches = window.matchMedia('(prefers-color-scheme: dark)').matches
  if (matches || darkMode) {
    document.documentElement.classList.add("dark")
  } else {
    document.documentElement.classList.remove("dark")
  }
}
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', adjustColors)
adjustColors();


document.addEventListener('DOMContentLoaded', function() {
  var root = document.body
  m.mount(root, WindowManager)
  var searchEl = document.getElementById("search");
  searchEl.focus();

  chrome.storage.onChanged.addListener(function(changes, namespace) {
    for (let key in changes) {
      var storageChange = changes[key];
      console.log('Storage key "%s" in namespace "%s" changed. ' +
                  'Old value was "%s", new value is "%s".',
                  key,
                  namespace,
                  storageChange.oldValue,
                  storageChange.newValue);
    }
    loadGroups()
  });
})

window.addEventListener("focus", function(event) { 
  var searchEl = document.getElementById("search");
  searchEl.focus();
  document.execCommand('selectAll',false,null)
}, false);

window.addEventListener("click", function(event) { 
  if (contextTarget && !event.target.closest("menu")) {
    clearContext();
    m.redraw();
  }
}, false);


// Window auto-focus

var focusTimeout = undefined;
if (navigator.platform == 'MacIntel') {
  document.addEventListener('mouseenter', e => {
    if (myWindowId && autofocus) {
      chrome.windows.update(myWindowId, { "focused": true })
    }
    focusTimeout = setTimeout(e => {
      //console.log("timeout")
      },1000)
    })

  document.addEventListener('mouseleave', e => {
    clearTimeout(focusTimeout);
  })
}


async function searchInput(e) {
  if (!e) return;
  var query = e ? e.target.value : undefined;
  activeQuery = query;
  activeQueryItems = [];
  m.redraw.sync();
  if (query.length > 0) {
    performDeepSearch(query, (valid) => {
      if (valid && query.length > 0) {
        m.redraw.sync();
        let tab = document.querySelector(".tab") 
        if (query.length > 0) selectItem(tab)
      } else {
      }
      m.redraw.sync();
    })
  } else {
    activeSearchResults = [];
    //queryTab = undefined;
    m.redraw.sync();
  }
}

function sortResults(a,b) {
  let order = (b.visitCount || 1) - (a.visitCount || 1);
  
  if (!order) order = (b.lastVisitTime || b.dateAdded) - (a.lastVisitTime || a.dateAdded);
  return order;
}

let SUGGEST_BASE = "https://suggestqueries.google.com/complete/search?client=chrome&q="
async function suggestResults(query) {
  const response = await fetch(SUGGEST_BASE + encodeURIComponent(query),  {"mode": 'no-cors'})
  const results = await response.json();
  let items = [];
  const urls = results[1];
  const titles = results[2];
  const relevances = results[4]['google:suggestrelevance'];
  const types = results[4]['google:suggesttype'];
  const subtypes = results[4]['google:suggestsubtypes'] || [];
  for (let i in urls) {
    let url = urls[i].startsWith("http") ? urls[i] : SEARCH_PREFIX + urls[i];
    let title = titles[i].length ? titles[i] : urls[i];
    let type = types[i];
    items.push({
      url, title, type,
      id:url,
      query:query,
      relevance:relevances[i],
      subtypes:subtypes[i]
    });
  }
  return items;
}

function historySearch(params) {
  return new Promise(resolve => chrome.history.search(params, resolve));
}

async function tabSearch(query) {
  let results = [];
  for (let w of windows) {
    for (let tab of w.tabs) {
      if (!tab.title.toLowerCase().includes(query) && !tab.url.includes(query)) continue;
      tab.type = "tab";
      results.push(tab);
    }
  }
  
  return results;
}
async function performDeepSearch(query, callback) {
  let results = await tabSearch(query)

  if (results.length) {
    activeSearchResults = results;
    m.redraw();
  }

  
  if ((query.length > 2)) {

    if (query.indexOf(".") > 0 && query.indexOf(" ") < 0) {
      let url = "https://" + query
      results.push({title:query, url:url});
    } else if (query.startsWith("chrome:")) {
      results.push({title:query, url:query});
    }

    results.push({title:query, url:SEARCH_PREFIX + query})

    let history = await historySearch({text:query, maxResults:30, startTime:0});
    let bookmarks = await chrome.bookmarks.search({query:query})
    let suggest;
    if (isMenuMode || isSearchMode) {
      suggest = await suggestResults(query);
    }
    history = history.concat(bookmarks);
    history.sort(sortResults);
    history.splice(10);

    results = results.concat(history, suggest)
  }



      let titles = {};
      let prunedResults = [];

      results.forEach(r => {
        if (!r) return;
        if (!titles[r.title]) {
          titles[r.title] = r;
          prunedResults.push(r);
        }
      }) 

      prunedResults.splice(30);

      if (query == activeQuery) {
        activeSearchResults = prunedResults;
        callback(true)
      } else {
        callback(false)
      }
  //   })
  // })

}


async function searchKey(e) {
  if (e.key == "Escape" && (isMenuMode || isSearchMode)) {
    window.close();
    return;
  }

  if (e.key == "Enter") {
    e.preventDefault();
    e.stopPropagation();
    let tabs = document.getElementsByClassName("tab");
    let tab = Array.from(tabs).filter(t => t.id == selectedItemId)[0];
    
    let id = parseInt(tab.getAttribute('id'))
    let wid =  parseInt(tab.getAttribute('wid'))
    let url = tab.getAttribute('href');

    if (url) {
      await focusResult(url, true, true)      
    } else {
      focusTab(id, wid, true); 
    }
    clearSearch();
    return;
  }
}

function clearSearch() {
  queryTab = undefined;
  queryTabHistoryClear()

  var searchEl = document.getElementById("search");
  searchEl.value = "";
  activeQuery = ""
  activeQueryItems = undefined
  selectedItemId = undefined;
  activeSearchResults = [];
  currentSearch = undefined;
  clearTimeout(currentSearchTimeout);
  m.redraw();
}
  
function sortByDomain(a,b) {
  return a.reverseHost.localeCompare(b.reverseHost);
}
function sortByTitle(a,b) {
  return a.title.localeCompare(b.title);
}
function sortByKey(key, a, b) {
  return a[key] - b[key];
}

function typeForTab(tab) {
  if (/[docs|sheets|slides]\.google\.com/.test(tab.hostname)) {
    return "Document";
  }
  if (/[calendar|mail]\.google\.com/.test(tab.hostname)) {
    return "App";
  }
  if (/.*\.slack\.com/.test(tab.hostname)) {
    return "Communication";
  }
  return "Other"
}

function sortTabs(type) {
  chrome.windows.getAll({populate:true, windowTypes:['normal']}, (windows) => {
    windows.forEach(w => {
      let tabs = w.tabs
      tabs.forEach((tab) => {
        tab.domain = tab.url
        try {
          let hostname =  new URL(tab.url).hostname;
          tab.hostname = hostname;
          tab.reverseHost = hostname.split('.').reverse().join('.');;
        } catch (e) {
          tab.reverseHost = "zzzz." + tab.url; // lol
        } 
        tab.type = typeForTab(tab);
      });

      let groups = {}

      if (type == 'domain') {
        tabs.sort(sortByDomain);
        console.log(tabs.map(t=>t.reverseHost))
      } else if (type == 'title') {
        tabs.sort(sortByTitle);
      } else if (type == 'type') {
        tabs.sort(sortByType); 
      }

    
      let orderedIds = [];      
      tabs.forEach((tab) => {
        if (tab.pinned) return;
        if (preserveGroups && tab.groupId > 0) return;
        orderedIds.push(tab.id);
        let cluster = tab.hostname;
        if (cluster) {
          if (!groups[cluster]) groups[cluster] = [];
          groups[cluster].push(tab.id) 
        }
      });
      console.log(orderedIds)
      chrome.tabs.move(orderedIds, {index:-1, windowId:w.id});
      //if (!preserveGroups) 
      chrome.tabs.ungroup(orderedIds)
      .then(() => {
        var otherTabs = [];
        if (type == 'domain') {
          for (var cluster in groups) {
            let tabIds = groups[cluster];
            if (tabIds.length > 1) {
              let components = cluster.split(".");
              if (components[0] == "www") components.shift();
              components.pop();
              let name = components.reverse().join(" • ");

              chrome.tabs.group({tabIds:tabIds, createProperties:{windowId:w.id}})
              .then(group => { chrome.tabGroups.update(group, {title: name})})
            } else {
              otherTabs.push(tabIds[0])
            }
          }

          console.log("otherTabs", otherTabs)
          chrome.tabs.group({tabIds:otherTabs, createProperties:{windowId:w.id}})
          .then(gid => chrome.tabGroups.update(gid, {title: "Other"}))
          .then(group => chrome.tabGroups.move(group.id, {index:-1, windowId:w.id}))
          .then(() => chrome.tabs.ungroup(otherTabs))
        }
      })
    })
  });
} 

function removeDuplicates() {
  chrome.runtime.sendMessage({action:'removeDuplicates'}, (response) => {
    console.log('received response', response);
  });
  return;
}




//
// Utility functions
//

function getDefault(key, fallback) {
  let value = localStorage.getItem(key);
  if (value == undefined) return fallback;
  return JSON.parse(value);
}

function setDefault(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}


var titleReplacements = {
  "www.google.com": /(?<title>.*) - (?<app>Google) Search/,
  "www.amazon.com": /(?<app>Amazon)\.com: (?<title>.*)/,
  "app.slack.com": /(?<app>Slack) \| (?<title>.*)/,
}

var iconReplacements = {
  "www.google.com": /(.*) - Google Search/
}

function titleForTab(tab) {
  let title = tab.title;
  let app = undefined;
  if (tab.url.length) {
    let url;
    try {
      url = new URL(tab.url);
    } catch (e) {
      console.log(`cannot read url "${tab.url}"`, e)
    }

    if (simplifyTitles) {
      let replacement = titleReplacements[url.hostname];

      if (replacement) {
        let match = title.match(replacement);
        
        if (match) {
          title = match.groups.title;
          app = match.groups.app;
    
        }
        //title = tab.title.replace(replacement, '$1')
      } else {
        let components = tab.title.split(/\s[-–—•|\/]\s/g);
        if (components.length > 1) app = components.pop();
        title = components.join(' • ');
      }
    }
  }
  return {title, app};
}

//
// Drag and Drop
//

var draggedItem = undefined;
document.addEventListener("dragstart", function( event ) {
    let target = event.target;
    target = target.closest("[index]");
    draggedItem = target
    draggedItem.classList.add("dragged");

    let url = "about:blank";
    var dt = event.dataTransfer;
    dt.effectAllowed = 'all';
    dt.setDragImage(draggedItem, 24,12);
    dt.setData("text/uri-list", url);
    dt.setData("text/plain", url);

  })

document.addEventListener("dragenter", function( event ) {
  event.preventDefault();
  let target = event.target;
  target = target.closest('[index]');  
  if (!target) return;

  let dragIndex = parseInt(draggedItem.getAttribute("index"));
  let dropIndex = parseInt(target.getAttribute("index"));
  
  if (!target || target == draggedItem) return;
  //if (target) target.classList.add("droptarget", true);
}, false);

document.addEventListener("dragleave", function( event ) {
  event.preventDefault();
  let target = event.target;
  if (target != document.body) target = target.closest("[index]");
  if (!target) return;
  if (target) {
    target.classList.remove("droptarget", true);
    target.classList.remove("after", true);
  }
}, false);

document.addEventListener("dragover", function( event ) {
  let target = event.target;
  if (target != document.body) target = target.closest("[index]");
  if (target) {
    event.preventDefault();
    let bottomHalf = event.offsetY >= target.clientHeight / 2;
    target.classList.toggle("after", bottomHalf);
    target.classList.add("droptarget", true);

    let dropIndex = parseInt(target.getAttribute("index")) || -1;

  }
}, false);

document.addEventListener("drop", async function( event ) {
  let target = event.target;
  if (target != document.body) target = target.closest("[index]");


  let after = target.classList.contains("after");
  if (target) {
    target.classList.remove("droptarget", true);
    target.classList.remove("after", true);
  }

  draggedItem.classList.remove("dragged");
  if (!target || target == draggedItem) return;
  event.preventDefault();

  let dragId = parseInt(draggedItem.getAttribute("id"));
  let dragIndex = parseInt(draggedItem.getAttribute("index"));
  let dropIndex = target.getAttribute("index") ? parseInt(target.getAttribute("index")) : -1;
  let dropWid = parseInt(target.getAttribute("wid")) || parseInt(draggedItem.getAttribute("wid"));
  let dragGid = parseInt(draggedItem.getAttribute("gid")) || -1;
  let dropGid = parseInt(target.getAttribute("gid")) || -1;
  let groupDrag = draggedItem.classList.contains("header");
  let headerTarget = target.classList.contains("header");

  if (after && !headerTarget) dropIndex++;
  if (dropIndex == -2) dropIndex = 0;
  console.log(`move from ${dragIndex} to ${dropIndex}  in w:${dropWid} > g:${dropGid}`)
  if (dropIndex > dragIndex) dropIndex--;
  console.log(`move from ${dragIndex} to ${dropIndex}  in w:${dropWid} > g:${dropGid}`)

  if (groupDrag) {
    chrome.tabGroups.move(dragGid, {index:dropIndex, windowId:dropWid})
  } else {
    let tabs = await chrome.tabs.query({highlighted:true, windowId:dropWid})
    var tabIds = tabs.map(tab => tab.id);
    if (!tabIds.includes(dragId)) tabIds = [dragId];

    await chrome.tabs.move(tabIds, {index:dropIndex, windowId:dropWid})

    // Work around a bug in chrome.tabs.move https://bugzilla.mozilla.org/show_bug.cgi?id=1323311
    if (tabIds.length > 1) { 
      let anchorId = tabIds.shift();
      let anchorTab = await chrome.tabs.get(anchorId);
      await chrome.tabs.move(tabIds, {index:anchorTab.index + 1, windowId:dropWid})
    }
    
    if (dropGid == -1 || (headerTarget && !after)) {
      chrome.tabs.ungroup(tabIds, m.redraw)
    } else {
      chrome.tabs.group({groupId:dropGid, tabIds:tabIds})
    }
  }

}, false);

document.addEventListener("dragend", function( event ) {
  draggedItem.classList.remove("dragged");
  draggedItem = undefined;
})

async function selectItem(item, immediately) {
  let id = item.getAttribute("id");
  scrollToElement(item);
  selectedItemId = id;

  if (isMenuMode) return;


  if (autofocusResults && !isMenuMode) {
    let tabId = parseInt(id)
    if (tabId) {
      let tab = await chrome.tabs.update(tabId, { 'active': true });
      if (!tab.discarded) focusTab(tabId);
    } else {
      let url = item.getAttribute('href');
      focusResult(url, immediately, false);
    }
  }

}



window.onkeydown = function(event) {
  if (event.key == "ArrowUp" || event.key == "ArrowDown") {
    event.preventDefault();

    let direction = event.key == "ArrowDown" ? 1 : -1;    

    let tabs = document.querySelectorAll(".tab")
    tabs = Array.from(tabs);

    let index = tabs.findIndex(t => t.id == selectedItemId);
    if (index < 0) index = tabs.findIndex(t => t.classList.contains("active"))
    if (index < 0) index = 0;
    
    let selectedItemIndex = index + direction;
    let tab = tabs[selectedItemIndex] || tabs[0];

    selectItem(tab, true);

    m.redraw();
  } 

  if (event.metaKey && !event.shiftKey && event.key == 't') { // C-T
    chrome.tabs.create({})
      .then ((tab) => {    
        console.log("tab", tab)
        chrome.windows.update(tab.windowId, { "focused": true })
      }) 
    event.preventDefault(); 
  } else if(event.metaKey && event.key == 's') {  // C-S
    event.preventDefault(); 
  } else if(event.metaKey && event.key == 'g') {  // C-G
    groupTabs(event);
    event.preventDefault(); 
    event.stopPropagation();
  } else if(!isSearchMode && event.metaKey && event.key == 'r') {  // C-R
    let options = event.shiftKey ? {} : undefined;
    chrome.tabs.query({highlighted:true, windowId: lastWindowId})
    .then((tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.reload(tab.id, options)
      })
    });
    event.preventDefault(); 
  } else if ((event.key == "Backspace" && event.target == document.body)
     || (event.metaKey && event.key == 'w' && !isSearchMode)) { 
    event.preventDefault();     
    closeTab();
    return false;
  }
  if (event.key == "Enter" && event.target != document.body) { 
    let header = event.target.closest('.header');
    let gid = parseInt(header.getAttribute("gid"));
    chrome.tabGroups.update(gid, {title: event.target.innerText.trim()})
    event.target.blur();
    groupBeingEdited = undefined;
    event.preventDefault();
    event.stopPropagation();
  }
}

function closeTab() {
  chrome.tabs.query({highlighted:true, windowId: lastWindowId})
  .then((tabs) => {
    console.log(tabs)
    chrome.tabs.remove(tabs.map(t => t.id))
  });
}

function popOutSidebar(id) {
  chrome.windows.create({
    url: chrome.runtime.getURL("sidebar.html"),
    type: "popup",
    width:256,
    height:window.screen.availHeight,
    top:0,
    left:0
  }, (w) => {
    w.alwaysOnTop = true;
    window.close();
  });
}

function showMenu() {
}



//
// tab lifecycle
//


var windows = []
function sortWindows(w1,w2) {
  let i, j;
  for (i = 0; i < w1.tabs.length; i++) { if (!w1.tabs[i] || !w1.tabs[i].pinned) break; }
  for (j = 0; j < w1.tabs.length; j++) { if (!w2.tabs[j] || !w2.tabs[j].pinned) break; } 
  if (j - i == 0) return w2.tabs.length - w1.tabs.length;
  return j - i;
}
function updateWindows(...args) {
  //console.log("update", this, args)
  var b = {}
  var groupId = undefined;
  var windowId = -1;
  var groupEl = undefined;
  chrome.windows.getAll({populate:true, windowTypes:['normal']}, w => {
    windows = w;
    windows.sort(sortWindows);
    if (!lastWindowId) lastWindowId = windows[0].id;
    m.redraw();

    if (this == 'tabs.onActivated') {
      let id = args[0].tabId;
      let el = document.getElementById(id);
      scrollToElement(el);
    }
  });
  return;
}

function scrollToElement(el) {
  if (!el) return;
  var rect = el.getBoundingClientRect();
  var elemTop = rect.top;
  var elemBottom = rect.bottom;

  // Only completely visible elements return true:
  var isVisible = (elemTop >= 0) && (elemBottom <= window.innerHeight);

  el.scrollIntoView({behavior: "smooth", block: "nearest"});
}

function updateTab(tabId, changeInfo, tab) {
  if (tabId == queryTab) {
    console.log("queryTab", changeInfo)
  }
  if (tabsToDiscard[tabId] == true && changeInfo.title) {
    chrome.tabs.discard(tabId);
    delete tabsToDiscard[tabId];
  }
  for (var w of windows) {
    if (w.id == tab.windowId) {
      w.tabs[tab.index] = tab;
      if (changeInfo.groupId != -1) m.redraw();
      return;
    }
  }
}
function updateGroup(tabGroup) {
  let priorInfo = groupInfo[tabGroup.id] || {};
  if (tabGroup.collapsed && !priorInfo.collapsed) {
    console.log("collapsed", tabGroup)
  }
  groupInfo[tabGroup.id] = tabGroup;
  m.redraw();
}

function tabCreated(tab) {
  if (tab.pendingUrl == "chrome://newtab/") {
    focusWindow(tab.windowId)
  }
  updateWindows();
}

chrome.tabs.onActivated.addListener(updateWindows.bind("tabs.onActivated"));
chrome.tabs.onAttached.addListener(updateWindows.bind("tabs.onAttached"));
chrome.tabs.onCreated.addListener(tabCreated);
chrome.tabs.onDetached.addListener(updateWindows.bind("tabs.onDetached"));
chrome.tabs.onHighlighted.addListener(updateWindows.bind("tabs.onHighlighted"));
chrome.tabs.onMoved.addListener(updateWindows.bind("tabs.onMoved"));
chrome.tabs.onRemoved.addListener(updateWindows.bind("tabs.onRemoved"));
chrome.tabs.onReplaced.addListener(updateWindows.bind("tabs.onReplaced"));
chrome.tabs.onUpdated.addListener(updateTab);
chrome.tabGroups.onCreated.addListener(updateWindows.bind(""));
chrome.tabGroups.onMoved.addListener(updateWindows.bind(""));
chrome.tabGroups.onRemoved.addListener(updateWindows.bind(""));
chrome.tabGroups.onUpdated.addListener(updateGroup);
chrome.windows.onCreated.addListener(updateWindows.bind(""));
chrome.windows.onRemoved.addListener(updateWindows.bind(""));
chrome.windows.onFocusChanged.addListener((w) => {
  if (w != myWindowId && w > 0) {
    lastWindowId = w;
    updateWindows();
  }
});

updateWindows()




//
// Mithril Classes
//


var WindowManager = function(vnode) {
  return {
    view: function(vnode) {
      return [
        m(Toolbar),

        m(RecentTabs, {}),
        m(WindowList, {windows:windows}),
        m(SearchResults, {results: activeSearchResults}),
        m(ContextMenu),
        m(ArchivedGroups, {groups:groupList})
      ] 
    }
  }
}

async function arrangeWindows() {
  let sidebar = await chrome.windows.get(myWindowId)
  let windows = await chrome.windows.getAll({populate:true, windowTypes:['normal']});
  let screen = window.screen;

  console.log("window", sidebar, screen, windows)

  let sidebarRect = {
    left: screen.availLeft, 
    top: screen.availTop, 
    height:screen.availHeight, 
    width:sidebar.width
  };
  let windowsRect = {
    left: screen.availLeft + sidebar.width,
    top: screen.availTop, 
    height: screen.availHeight, 
    width: screen.availWidth - sidebar.width
  }
  chrome.windows.update(sidebar.id, sidebarRect);
  windows.forEach(w => chrome.windows.update(w.id, windowsRect));
}

function discardAllTabs() {
  windows.forEach(w => {
    w.tabs.forEach(tab => {
      if (!tab.active && !tab.discarded) chrome.tabs.discard(tab.id)
    })  
  })
}

function refresh() {
  chrome.runtime.sendMessage({action:'reload'}, (response) => {
    window.location.reload()
  });
}

function toggle(v) {
  v = !v;
  setDefault(v);
}

var Toolbar = function(vnode) {
  return {
    view: function() {
      return m("div.toolbar", 
        isSearchMode ?
          m('div.button#searchicon', m('span.material-icons','search'))
          : null,
        m(Search),
        myWindowId ? undefined : m('div.button#popout', {onclick:popOutSidebar}, m('span.material-icons','open_in_new')),
        // groupList.length ? m('div.button',
        //   m('span.material-icons','label_outline'),
        //   m('div.sort.menu',
        //     m(ArchivedGroups, {groups:groupList})
        //   )) : undefined,
        isSearchMode ? null : m('div.button',
          m('span.material-icons','sort'),
          m('div.sort.menu',
          m('div.action', {title:"Align Windows",
            onclick: arrangeWindows
          }, "Align Windows"),
          m('hr'),

          m('div.action', {onclick:() => { removeDuplicates() }}, "Remove Duplicates"),
          m('div.action', {onclick:() => { discardAllTabs() }}, "Sleep background tabs"),
          m('hr'),

          m('div.action', {onclick:() => { sortTabs('domain') }}, "Group by Domain"),
            //m('div.disabled', {onclick:() => { sortTabs('type') }}, "Sort by Type"),
            m('div.action', {onclick:() => { sortTabs('title') }}, "Sort by Title"),
            //m('div.disabled', {onclick:() => { discardAllTabs() }}, "Combine Windows"),
            m('hr'),
            m('div.action', {class: preserveGroups,
              onclick: () => setDefault(v({preserveGroups}), preserveGroups = !preserveGroups)
            }, "Preserve Groups")
          )),
        m('div.button', {onclick:showMenu},
          m('span.material-icons','more_vert'),
          m('div.sort.menu',
            m('div.action', {class: autofocus, title:"(Mac only), focuses this window when the mouse enters, to reduce the need to click multiple times.",
            onclick: () => setDefault(v({autofocus}), autofocus = !autofocus)
            }, "Activate window on hover"),
            m('div.action', {class: autofocusResults, title:"Focus first result while typing",
            onclick: () => setDefault(v({autofocusResults}), autofocusResults = !autofocusResults)
            }, "Autofocus top search result"),
            m('div.action', {class: simplifyTitles, title:"Simplify titles",
            onclick: () => setDefault(v({simplifyTitles}), simplifyTitles = !simplifyTitles)
            }, "Simplify titles"),
            m('div.action', {class: darkMode, title:"Dark theme",
            onclick: () => { setDefault(v({darkMode}), darkMode = !darkMode), adjustColors()}
            }, "Dark theme"),
            m('hr'),
            m('div.action', {onclick: refresh},"Refresh")
          )
        )
      )   
    }
  }
}


var Search = function(vnode) {
  return {
    view: function() {
      return [
        m("div.search", m("input#search", {
          type:"search", 
          key:"search", 
          placeholder:"search",
          oninput: searchInput,
          onkeydown: searchKey, 
          autocomplete:"off"}))
      ]  
    }
  }
}


var WindowList = function(vnode) {
  return {
    view: function(vnode) {
      if (activeQuery) return null;
      if (!vnode.attrs.windows.length) return "";
      if (isSearchMode && (!activeQuery || activeQuery.length < 2)) return "";
      return m('div.windows#windows', {class:activeQuery ? "searching" : ""},
        vnode.attrs.windows.map(w => { return m(Window, {window:w, key:w.id})}
      ));
      
    }
  }
}

var groupInfo = {}
var Window = function(vnode) {
  return {
    view: function(vnode) {
      let w = vnode.attrs.window;
      
      let groups = []
      let children = []
      var b = {}
      var currentGroup = undefined;
      var currentGroupId = undefined;
      w.tabs.forEach((tab, i) => {
        var groupId = tab.groupId;
        if (tab.pinned) groupId = -2;

        if (currentGroupId == undefined || currentGroupId != groupId) {
          if (groupId > 0 && !groupInfo[groupId]) {
            chrome.tabGroups.get(groupId, (info) => {
              groupInfo[info.id] = info
              m.redraw();
            });
          }
          currentGroupId = groupId;
          currentGroup = {id:groupId, tabs:[], info:groupInfo[groupId]}
          groups.push(currentGroup)
        }
        currentGroup.tabs.push(tab)
      }) 

      var classList = [];
      if (w.id == lastWindowId) classList.push('frontmost');
      let groupNodes = [];
      
      groups.forEach((group, i) => {
        let el = m(TabGroup, {group, key:group.id > 0 ? group.id : i});
        if (el) {
          groupNodes.push(m('div.group-padding', {key:group.id+"-before-" + i, index:i, wid:w.id}))
          groupNodes.push(el);
        }
      });
      if (!groupNodes.length) return undefined;

      return m('div.window', {
            class:classList,
            onclick:(e) => {clearContext(); e.preventDefault();},
            oncontextmenu: (e) => {e.preventDefault();},
            index:-2
          }, [
          m('div.header', m('div.title', "Window " + w.id)),
          m('div.contents',groupNodes),
      ])
    }
  }
}

var tabOpeners = JSON.parse(localStorage.getItem('tabOpeners')) || {}

setTimeout(updateOpeners, 1000)

function updateOpeners() {
  var promises = [];
  for (let tabId in tabOpeners) {

    promises.push(chrome.tabs.get(parseInt(tabId))
      .then((tab) => {
        //console.log("Found", tabId)
      })
      .catch((error) => {
        delete tabOpeners[tabId];
    }))
  }

  Promise.all(promises).then(saveOpeners)

}
function saveOpeners() {
  localStorage.setItem('tabOpeners',JSON.stringify(tabOpeners))
}


let contextTarget = undefined;
let contextEvent = undefined;
function clearContext() {
  contextTarget = undefined;
  contextEvent = undefined;
}

function showContextMenu(e) {
  e.preventDefault();
  e.stopPropagation();
  chrome.windows.update(myWindowId, { "focused": true })
  contextTarget = this;
  contextEvent = e;
}


let SEARCH_DELAY = 2000;
let currentSearch;
let currentSearchTimeout;

function submitSearch() {
  currentSearchTimeout = undefined;
  console.log("Searching for", currentSearch.text)
  chrome.search.query(currentSearch)
  if (currentSearch.tabId) chrome.tabs.update(currentSearch.tabId, {active:true})
}

async function focusResult(url, immediately, focusWindow) {


  if (url.startsWith(SEARCH_PREFIX)) {
    let query = url.slice(SEARCH_PREFIX.length)
    
    if (!queryTab && immediately) {
      queryTab = await chrome.tabs.create({url: "about:blank", active:true})
    }

    // if (queryTab) {
      
    // } else {
    //   currentSearch = {text:query, disposition: "NEW_TAB"}
    // }
  
    if (immediately) {
      currentSearch = {text:query, tabId: queryTab.id}
      submitSearch();
    } else if (!currentSearchTimeout) {
      //currentSearchTimeout = setTimeout(submitSearch, SEARCH_DELAY)
    }
    
  } else {
    if (queryTab) {
      chrome.tabs.update(queryTab.id, {url: url});
    } else {
      queryTab = await chrome.tabs.create({url: url, selected:true, active:true})
    }
  }

  if (focusWindow) {
    chrome.windows.update(queryTab.windowId, { "focused": true })  ;
  }

}

var RecentTabs = function(vnode) {
  return {
    view: function(vnode) {
      return m("div.group.recents", tabRecents.map(tab => {
        console.log("tab", tab)
        return m('div.tab.result', {
            class:"history", 
            id: "recent" + "-" + tab.id,
            onclick: focusTab.bind(null, tab.id, tab.windowId)
          },
          m('img.icon', {src: tab.favIconUrl}),
          m('div.title', tab.title)
        )
      }))
    }
  }
}

var SearchResults = function(vnode) {
  return {
    view: function(vnode) {
      let results = vnode.attrs.results;
      return m('div.group.search-results', results.map((tab) => {
        if (!tab.url) return null;
        let host = tab.url ? new URL(tab.url).hostname : tab.url;
        let type = tab.url.startsWith(SEARCH_PREFIX) ? "search" : "site";
        if (tab.lastVisitTime) type = "history";
        if (tab.parentId) type = "bookmark";
        let id = type + "-" + tab.id;

        let classList = [type];
        if (selectedItemId == id) classList.push("selected");

        let favIconUrl = tab.favIconUrl || favicons[host] || (host && host.length ?`https://www.google.com/s2/favicons?domain=${host}` : undefined)
        
        if (type == "search") favIconUrl = "/img/search.svg"
        if (!favIconUrl) favIconUrl = "/img/icon-url.png"

        if (tab.subtypes && tab.subtypes.includes(10)) classList.push("didyoumean");

        if (tab.type == 'tab') {
          return m(Tab, {tab})
        }
        let {title, subtitle} = titleForTab(tab)

        if (tab.query) {
          let components = title.split(tab.query);
          components = components.map(s => s.length ? "<b>" + s + "</b>" : s)
          title = components.join(tab.query)
        }
        return m('div.tab.result', { class: classList.join(" "),
            id: id,
            href: tab.url,
            onclick: focusResult.bind(null, tab.url, true, true)
          },
          m('img.icon', {src: favIconUrl}),
          m('div.title', m.trust(title), subtitle ? m('span.app', " • " + subtitle) : undefined)
        )
        
      }));
    }
  }
}

var ContextMenu = function(vnode) {
  return {
     view: function(vnode) {
      if (!contextTarget) return undefined;
       let item = contextTarget;
       let isTab = contextTarget.groupId != undefined;
       let e = contextEvent;
       let target = e.target.closest("[index]");
       let style = {}
       var rect = target.getBoundingClientRect();
       style.top = window.scrollY + (rect.bottom - 2) + "px";
       if (e.clientX < window.innerWidth / 2) {
        style.left = e.clientX + "px";
       } else {
        style.right = Math.max(window.innerWidth - rect.right, 4) + "px";
       }

       if (isTab) {
        return m("div.menu#contextmenu", {class:'visible', style:style},
          m('div.action.group-tabs', {title:'Group', onclick:groupTabs.bind(item)},
            m('span.material-icons',"layers"), 'Group Tabs'),
            // m('div.action.archive', {title:'Archive', onclick:archiveTab.bind(item)}, 
            //   m('span.material-icons',"save_alt"), "Archive"),
            m('div.action.close', {onclick: close.bind(item)}, m('span.material-icons',"close"), "Close")
          // m('div.action.popout', {title:'Pop Out', onclick:popOutTab.bind(item)},
          //   m('span.material-icons',"open_in_new"), 'Move to new window')
        );
       } else {
        return m("div.menu#contextmenu", {class:'visible', style:style},
          m('div.action.archive', {title:'Archive', onclick:archiveGroup.bind(item)},
            m('span.material-icons',"close"), "Save and Close"),
          m('div.action.close', {title:'Close', onclick:closeGroup.bind(item)},
            m('span.material-icons',"delete"), 'Delete group'),
            m('hr'),

          m('div.action.popout', {title:'Open in new window', onclick:popOutGroup.bind(item)},
            m('span.material-icons',"open_in_new"), 'Move to new window'),
          m('div.action.ungroup', {title:'Ungroup', onclick:ungroupGroup.bind(item)},
            m('span.material-icons',"layers_clear"), 'Ungroup'),
          m('div.action.rename', {title:'Rename', onclick:editGroup.bind(item.id)},
            m('span.material-icons',"edit"), 'Rename'),


          );
      }

    }
  }
}


function popOutGroup(e) {
  e.stopPropagation();
  clearContext();

  let groupId = this.id;

  chrome.windows.get(this.info.windowId, {})
  .then(sourceWindow => {      
    chrome.windows.create({
      url: "about:blank",
      type: "normal",
      width:sourceWindow.width,
      height:sourceWindow.height,
      top:sourceWindow.top,
      left:sourceWindow.left
    })
    .then( window => {
      let extraTab = window.tabs[0].id;
      chrome.tabGroups.move(this.id,{windowId:window.id, index:0})
      .then(group => {    
        chrome.tabs.remove(extraTab)
      })  
    })
  })
}

function archiveTab(e) {
  e.stopPropagation();
}


let colorEmoji = { grey: "⚪️", blue: "🔵", red: "🔴", yellow: "🟡", green: "🟢", pink: "🌸", purple: "🟣", cyan: "🌐" }



function emojiTitleForGroupInfo(info) {
  return `${colorEmoji[info.color]} ${info.title || info.color}`;
}

function archiveGroupToDataURL(group, parentId = "1") {
  let links = group.tabs.map((tab) => `<p><a href="${tab.url}">${tab.title}</a>`)
  let html = [
    `${group.info.title || group.info.color}`,
    `${links.join('')}`,
    `<meta charset="UTF-8">`,
    `<title>${group.info.title}</title>`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<style>b{color:${group.info.color}}\nbody{max-width:30em;margin:10vh auto;padding:2em;font-family:system-ui;}</style>`
  ].join('');

  let url = 'data:text/html,' + encodeURIComponent(html).replace(/%20/g, " ");
  return chrome.bookmarks.create({parentId, title: emojiTitleForGroupInfo(group.info) + " - Group", url:url})
}

async function archiveGroup(e) {
  e.stopPropagation();
  let group = this;
  await archiveGroupToStorage(group);
  await archiveGroupToBookmarks(group);
  chrome.tabs.remove(group.tabs.map(t => t.id));
}

async function archiveGroupToBookmarks(group) {
  let rootId = await getBookmarkRoot();
  let title = group.info.title || group.info.color;
  let fancyTitle = `${colorEmoji[group.info.color]} ${title}`;

  let folder = (await chrome.bookmarks.search({title:fancyTitle}))[0];
  if (!folder) folder = await chrome.bookmarks.create({parentId: rootId, title: fancyTitle})

  let tree = (await chrome.bookmarks.getSubTree(folder.id))[0];

  for (var node of tree.children) {
    if (!node.children) {
      let result = await chrome.bookmarks.remove(node.id);
    }
  }


  // let urlArray = group.tabs.map(tab => {return tab.url;})
  // urlArray = encodeURIComponent(JSON.stringify(urlArray))
  // return chrome.bookmarks.create({parentId: "1", title: fancyTitle, url:url})
  let promises = [];
  group.tabs.forEach(tab => {
    promises.push(chrome.bookmarks.create({parentId: folder.id, title: tab.title, url: tab.url}))
  })
  let results = await Promise.all(promises);

}

function archiveGroupToStorage(group) {
  let title = group.info.title || group.info.color;
  let fancyTitle = `${colorEmoji[group.info.color]} ${title}`;

  let info = {
    title: group.info.title,
    color: group.info.color,
    ts: new Date().getTime(),
    tabs: group.tabs.map( (tab) => ({url: tab.url, title:tab.title}) )
  };
  
  let key = 'group-' + title;
  let record = {};
  record[key] = info
  
  let storage = chrome.storage.sync;
  storage.set(record, (r1) => {
    groupList.push(info);
  })
}

var bookmarkRoot = getDefault(v({bookmarkRoot}));
let BOOKMARK_FOLDER_TITLE = "Tab Archive​";

async function getBookmarkRoot() {
  getDefault(v({bookmarkRoot}));
  if (bookmarkRoot) {
    try {
      await chrome.bookmarks.get(bookmarkRoot)
    } catch(err) {
      bookmarkRoot = undefined;
    }
  }

  if (!bookmarkRoot) {
    let folder = await chrome.bookmarks.search({title:BOOKMARK_FOLDER_TITLE})
    console.log("folder", folder)
    folder = folder[0]

    if (!folder) {
      folder = await chrome.bookmarks.create({parentId: '2', 'title': BOOKMARK_FOLDER_TITLE, index:0});
    }

    if (folder.id) {
      setDefault(v({bookmarkRoot}), bookmarkRoot = folder.id)      
    }
  }
  return bookmarkRoot;
}



function closeGroup(e) {
  e.stopPropagation();
  clearContext();
  chrome.tabs.remove(this.tabs.map(t => t.id))
}

function ungroupGroup(e) {
  e.stopPropagation();
  clearContext();
  chrome.tabs.ungroup(this.tabs.map(t => t.id))
}

function groupTabs(e) {
  e.stopPropagation();
  clearContext();
  //let title = prompt("New Group")
  let windowID = this ? this.windowId : lastWindowId;
  if (true) {
    chrome.tabs.query({highlighted:true, windowId:windowID})
    .then(tabs => {
      // TODO: Check if the context target is different than highlighted tabs
      chrome.tabs.group({tabIds:tabs.map(t => t.id), createProperties:{windowId:windowID}})
      .then(group => { 
        setTimeout(editGroup.bind(group), 50);
//        chrome.tabGroups.update(group, {title: title})
      })
    })
  }
}

function popOutTab(e){

 }


 
function editGroup(e) {

  groupBeingEdited = this;
  m.redraw();
  if (e) e.stopPropagation();
  clearContext();
  let el = document.getElementById(this + "-title")
  el.focus();
  el.onblur = () => {
    window.getSelection().removeAllRanges();
    groupBeingEdited = undefined;
  }
  document.execCommand('selectAll',false,null)
}

function groupRenameEvent(e) {
  if (e.key == "Enter") {
    let group = this;
    let title = e.target.innerText.trim();
    console.log(title, e);

    chrome.tabGroups.update(this.id, {title: title})
  }
}

function newTabInGroup(e) {
  e.preventDefault();
  e.stopPropagation();
  clearContext();
  chrome.windows.update(lastWindowId, { "focused": true })
  .then((win) => 
    chrome.tabs.create({windowId:win.id})
  ).then ((tab) =>
    chrome.tabs.group({groupId:this.id, tabIds:[tab.id]})
  )
}

function openerForTab(tab) {
  return tab.openerTabId || tabOpeners[tab.id];
}

let groupBeingEdited = undefined;
var TabGroup = function(vnode) {
  function onclick (e) {
    chrome.tabGroups.update(this.id, { 'collapsed': !this.info.collapsed });
    clearContext();
  }

  return {
    view: function(vnode) {
      let group = vnode.attrs.group;
      let attrs = {}
      let classList = [];
      let collapsed = false; 
      if (group.info && group.id > 0) {
        classList.push(group.info.color);
        collapsed = group.info.collapsed;
        attrs.onclick = onclick.bind(group)
        attrs.oncontextmenu = showContextMenu.bind(group)
      } else {
        classList.push("no-group");
      }

      let title = group.info ? (group.info.title || (group.info.color)) : "Ungrouped";
      if (group.id == -2) {
        title = "Pinned";
        classList.push("pinned");
      }
      attrs.wid = group.tabs[0].windowId
      attrs.gid = group.id
      attrs.index = group.tabs[0].index
    
      let children = [];
      let lastTab = {};
      let openerStack = [];

      let tabs = group.tabs;
      tabs.forEach((tab, i) => {
        let isQuery = tab.url.startsWith("https://www.google.com/search")
        if (isQuery) tab.isQuery = true;

        
        let opener = tab.openerTabId || tabOpeners[tab.id];

        let index = openerStack.indexOf(opener);
        if (isQuery) index = -1;
        if (index == -1 && (lastTab.indent > 1)) {
          lastTab.endOfCluster = true;
        }
        openerStack.splice(index + 1)
        tab.indent = isQuery ? 0 : openerStack.length + 1;

        if (lastTab.id == openerStack[0]) {
          lastTab.startOfCluster = true;
        }
        openerStack.push(tab.id);
  
        tab.openerStack = openerStack.join(".")
        if (opener) {
          if (!tabOpeners[tab.id]) {
            tabOpeners[tab.id] = tab.openerTabId;
            saveOpeners();
          } 
        }

        lastTab = tab;

        if (activeQuery) {
          if (!tab.title.toLowerCase().includes(activeQuery) 
           && !tab.url.includes(activeQuery)
            ) {
            return;
          }

          activeQueryItems.push(tab.id);
        }

        children.push(m(Tab, {tab}))
      })
      
      if (collapsed && (!activeQuery  || activeQuery.length <= 1)) classList.push("collapsed");
      let height = collapsed ? 0 : children.length + 1;

      attrs.draggable = true;
      attrs.index = group.tabs[0].index

      if (contextTarget && (group.id == contextTarget.id)) attrs.class = ("showingMenu");

      if (activeQuery && !children.length) return undefined;

      if (groupBeingEdited == group.id) classList.push("editing");

      return m('div.group', {class:classList.join(" "), style:`flex-grow:${height}`},
        m('div.header', attrs,
          m('div.actions',
            m('div.action.edit', {title:'Rename', onclick:editGroup.bind(group.id)}, m('span.material-icons',"edit")),
            m('div.action.newtab', {title:'New tab in group', onclick:newTabInGroup.bind(group)}, m('span.material-icons',"add_circle_outline")),
            m('div.action.more', {title:'Menu', onclick:showContextMenu.bind(group)}, m('span.material-icons',"more_vert")),
            m('div.action.archive', {title:'Menu', onclick:archiveGroup.bind(group)}, m('span.material-icons',"close"))
          ),
          m('div.title', {id: group.id + "-title", contenteditable:true}, m.trust(title)),
          group.info ? m(ColorPicker, {color:group.info.color, gid:group.id}) : undefined
        ),
        children
      )
       
  
    }
  }
}



async function loadGroups() {
  let list = []
  let storage = chrome.storage.sync;
  storage.get(null, (result) => {
    for (var key in result) {
      if (!key.startsWith("group")) continue;
      list.push(result[key])
    }
    groupList = list;
  });
}
loadGroups()




let deleteGroup = async (group, e) => {
e.preventDefault();
  let storage = chrome.storage.sync;
  let key = 'group-' + (group.title || group.color);
  storage.remove(key);

  groupList.splice(groupList.indexOf(group),1)

  m.redraw();

}

let tabsToDiscard = {}

let restoreGroup = async (group) => {
  console.log("restore", group)
  
  let query = group.title.length ? {title: group.title} : {color: group.color} ;

  let storage = chrome.storage.sync;

  let key = 'group-' + (group.title || group.color);
  storage.remove(key)

  groupList.splice(groupList.indexOf(group),1)

  let existing = (await chrome.tabGroups.query(query))[0]
  if (existing) {
    console.log("existing", existing)
    let tabs = await chrome.tabs.query({windowId: existing.windowId})
    tabs = tabs.filter((tab) => {return tab.groupId == existing.id})
    if (tabs.length) focusTab(tabs[0].id);
  } else {
    let promises = group.tabs.map((tab, i) => {
      let promise = chrome.tabs.create({url: tab.url, selected:false, active:false})
      if (true) promise = promise.then(t => { tabsToDiscard[t.id] = true; return t;})
      return promise;
    })
    Promise.all(promises)
    .then (tabs => {
      return chrome.tabs.group({tabIds:tabs.map(t => t.id), createProperties:{windowId: tabs[0].windowId}})
      .then((gid) => {
        chrome.tabs.update(tabs[0].id, { 'active': true });
        chrome.tabGroups.update(gid, {title:group.title, color:group.color})
      })
    }); 
  } 
};

var groupsExpanded = false;
var ArchivedGroups = function(vnode) {
  function toggleGroupArchive() {
    groupsExpanded = !groupsExpanded; 
  }
  return {
    view: function(vnode) {
      let groups = vnode.attrs.groups;
      if (!groups.length) return undefined;
       groups.sort(sortByKey.bind(null, "ts"));
      return m('div.group-archive', {class: groupsExpanded ? "expanded" : undefined},
      m('div.toggle.material-icons', {onclick:toggleGroupArchive}, groupsExpanded ? "keyboard_arrow_down" : "keyboard_arrow_up"),
      groups.reverse().map( g => m('div.group-token', {class:g.color, onclick:restoreGroup.bind(null,g), oncontextmenu:deleteGroup.bind(null,g)},
         m('div.title', g.title || g.color)
         ))
      )
    }
  }
}


var ColorPicker = function(vnode) {
  let selectColor = (gid, color) => {
    chrome.tabGroups.update(gid, {color: color});
  }
  return {
    view: function(vnode) {
      let attrs = vnode.attrs;
      let colors = [];
      for (let color in colorEmoji) {
        colors.push(m('div.color', {class:color, onclick:(e) => {selectColor(attrs.gid, color); e.stopPropagation()}}))
      }
      return m('div.colorpicker',
        colors
      )
    }
  }
}




let favicons = {
  "chrome": "./img/newtab.png"
}

async function focusTab(id, wid, focusTheWindow) {
  if (!id) return false;
  let tab = await chrome.tabs.update(id, { 'active': true });
  if (!wid) wid = tab.windowId;
  if (tab.discarded || focusTheWindow || wid != lastWindowId) { 
    focusWindow(wid, myWindowId && !focusTheWindow)
  }
  return true;
}

async function focusWindow(wid, reactivateSelf) {
  await chrome.windows.update(wid, { "focused": true });
  if (reactivateSelf) {
    chrome.windows.update(myWindowId, { "focused": true })
  }
}

var Tab = function(vnode) {
  function onclick(e) {
    if (e.metaKey) {
      chrome.tabs.update(this.id, { 'highlighted': true });
    } else if (e.shiftKey) {
      let queryOptions = { active: true, windowId:this.windowId };
      chrome.tabs.query(queryOptions)
      .then((activeTab) => {
        let min = Math.min(activeTab[0].index, this.index);
        let max = Math.max(activeTab[0].index, this.index);
        let tabIds = []
        windows.forEach(w => {
          if (w.id == this.windowId) {
            w.tabs.forEach(t => {
              if (t.index >= min && t.index <= max) {
                chrome.tabs.update(t.id, { 'highlighted': true });
              }
            })
          }
        })

      })
    } else {
      focusTab(this.id, this.windowId)
    }
  }
  function close(e) {
    e.preventDefault();
    e.stopPropagation();
    chrome.tabs.remove(this.id)
  }
  return {
    view: function(vnode) {
      var tab = vnode.attrs.tab;
      let host = "";
      if (tab.url.startsWith("chrome://")) {
        host = "chrome"
      } else {
         host = tab.url ? new URL(tab.url).hostname : tab.url;
      }
      
      let favIconUrl = tab.favIconUrl || favicons[host] || (host && host.length ?`https://www.google.com/s2/favicons?domain=${host}` : undefined)

      if (queryTab?.id == tab.id ) return null;
      var classList = [];
      if (tab.pinned && !activeQuery) classList.push('pinned')
      if (tab.active) classList.push('active')
      if (tab.highlighted) classList.push('highlighted');
      if (host) classList.push("host-" + host.replace(/\./g,"-"))
      classList.push(tab.status)

      if (tab.audible) classList.push('audible');
      if (tab.discarded) classList.push('discarded');
      if (tab.startOfCluster) classList.push('cluster-start');
      if (tab.endOfCluster) classList.push('cluster-end');
      if (tab.isQuery && simplifyTitles) classList.push('query');
      if (tab.indent != undefined) {
        classList.push('indent-' + tab.indent);
      }


      if (selectedItemId == tab.id) classList.push("selected");

      if (contextTarget && (tab.id == contextTarget.id)) classList.push("showingMenu");
      let titles = titleForTab(tab)
      
      let emojicon = undefined;
      let match = titles.title.match(/(\p{Extended_Pictographic}+)/u)
      if ( match ) {
        emojicon = match[1];// runes(match[1]);
        titles.title = titles.title.replace(match[1], "")
      }

      let attrs = {
        id: tab.id,
        opener:tab.openerTabId || tabOpeners[tab.id],
        wid: tab.windowId,
        gid: tab.groupId,
        index: tab.index,
        title:tab.title + "\n" + host,
        class:classList.join(" "),
        oncontextmenu: showContextMenu.bind(tab)
      }
      attrs.onclick = onclick.bind(tab)
      attrs.draggable = true;
      
      //titles.title = `${tab.openerStack} - ${titles.title}`
      return m('div.tab', attrs,
        m('div.loader'),
        m('div.actions',
          // m('div.action.archive', {title:'Archive', onclick:archiveTab.bind(tab)}, m('span.material-icons',"save_alt")),
          
          m('div.action.close', {onclick: close.bind(tab)}, m('span.material-icons',"close"))
        ),
        emojicon ? m('span.icon', emojicon) : m('img.icon', {src: favIconUrl}),
        m('div.title', titles.title, titles.app ? m('span.app', " • " + titles.app) : undefined)
      )
    }
  }
}

chrome.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    console.log(sender.tab ?
                "from a content script:" + sender.tab.url :
                "from the extension");
    if (request.greeting == "hello")
      sendResponse({farewell: "goodbye"});
  }
);













// Bookmark mirroring

// chrome.bookmarks.onMoved.addListener(function(id, moveInfo) {
//   console.log("1MOVED", id, moveInfo); 
//   chrome.tabs.query({}, function(results) {
//     var tab = results[moveInfo.oldIndex]
//     console.log("2TAB", tab)
//     ignoreNextTabMove = true;
//     chrome.tabs.move(tab.id, {windowId:undefined, index:moveInfo.index}, function(){
//       console.log("3done")
//     })
//   });
// });

// chrome.bookmarks.onChildrenReordered.addListener(function(id, reorderInfo) {
//   console.log("REORDERED", id, reorderInfo); 
// });




// function updateTab(id, change, tab) {
// console.log("updateTab", id, change, tab)
// }

// function updateGroup(group) {
//   console.log("updateGroup", group)
// }

// chrome.tabs.onUpdated.addListener(updateTab);
// chrome.tabGroups.onUpdated.addListener(updateGroup);

