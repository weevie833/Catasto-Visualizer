// Loads the 3D view; the household list and search keep working if it fails.
import('./scene3d.js?v=8').catch(error => {
  const status = document.querySelector('#sceneStatus');
  status.hidden = false;
  status.textContent = 'The 3D environment could not be initialized in this browser. Reload the page or try a browser with WebGL support.';
  console.error('3D initialization:', error);
});
