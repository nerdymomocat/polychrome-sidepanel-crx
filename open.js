chrome.runtime.sendMessage({action:'restoreGroup', url:window.location}, (response) => {
  chrome.tabs.getCurrent().then(tab => {
    chrome.tabs.goBack(tab.id)
    .catch(() => {
      chrome.tabs.remove(tab.id);
    })
  })
});
