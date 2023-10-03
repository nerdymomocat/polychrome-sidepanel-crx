chrome.runtime.onInstalled.addListener(function() {
  console.log("Polychrome Installed");

});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  let handlers = {
    restoreGroup: restoreGroup,
    reload: reload,
    // focusSidebar: focusSidebar,
    'removeDuplicates': removeDuplicates
  }

  if (handlers[message.action]) {
    if (!handlers[message.action](message, sender, sendResponse)) {
      sendResponse();
    };
  } else {
    console.error("handler not found", message)
    sendResponse(undefined)
  }
});

function reload() {
  //chrome.runtime.reload()
}

function removeDuplicates() {
  chrome.windows.getAll({populate:true, windowTypes:['normal']})
  .then((windows) => {
    var idsToRemove = []
    var knownURLs = {};
    windows.forEach(w => {
      w.tabs.forEach((tab) => {
        if (!knownURLs[tab.url]) {
          knownURLs[tab.url] = tab.id;
        } else {
          idsToRemove.push(tab.id)         
        }
      })
      chrome.tabs.remove(idsToRemove.reverse());
    })
  })
}

function restoreGroup(args, sender, sendResponse) {
  let url = new URL(sender.url);
  let id = url.hash.substr(1);
  let params = new URLSearchParams(url.search);
  if (params) {
    restoreGroupWithBookmark(params)
  }
}

function restoreGroupWithBookmark(params) { 
  let id = params.get('id');
  let color = params.get('color');
  let urls = JSON.parse(params.get('urls'));
  let title = params.get('title');

  return chrome.tabGroups.query({title: title, color:color})
  .then (groups => {
    // let group = groups[0];
    // if (group) {
    //   console.log("group", group, {groupId:group.id, windowId:group.windowId})
    //   let m = chrome.tabs.query({windowId:group.windowId})
    //   .then(tabs => {
    //     console.log("found", tabs)
    //   })
    //   return;
    // }
  
    // let title = folder.title;
    // return chrome.bookmarks.getChildren(id)
    // .then ((children) => {
    //   console.log(`Restoring Bookmark Group [${folder.title}]` )

    //   let promises = [];
    //   children.forEach(bookmark => {
    //     if (bookmark.url.startsWith("chrome-extension://")) return;
    //     promises.push(chrome.tabs.create({url: bookmark.url, selected:false, active:false}))
    //   })
    //   return Promise.all(promises);

    // })

    console.log(`Restoring Bookmark Group [${title}]` )

    let promises = [];
    urls.forEach((url,i) => {
      let promise = chrome.tabs.create({url: url, selected:false, active:false})
      //if (i > 0) promise = promise.then(tab => chrome.tabs.discard(tab.id))
      promises.push(promise)
    })
    Promise.all(promises)
    .then (tabs => {
      return chrome.tabs.group({tabIds:tabs.map(t => t.id), createProperties:{}})
      .then((gid) => {
        chrome.tabs.update(tabs[0].id, { 'active': true });
        chrome.tabGroups.update(gid, {title:title, color:color})
      })
      
    }); 
  })
}

