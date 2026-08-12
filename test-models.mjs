const API_KEY = 'AIzaSyAg8Nn7b-X8SLYNg85pWrfop_70YHPAwvg';

async function listModels() {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`);
  const data = await response.json();
  console.log(data);
}
listModels();
