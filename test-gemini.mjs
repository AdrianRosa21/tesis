import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI('AIzaSyAg8Nn7b-X8SLYNg85pWrfop_70YHPAwvg');
async function test() {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent('hello');
    console.log(result.response.text());
  } catch (e) {
    console.error('flash error:', e.message);
  }
}
test();
