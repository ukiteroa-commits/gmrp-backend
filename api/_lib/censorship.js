const badWords = [
  'хуй', 'пизда', 'бля', 'ебать', 'залупа', 'мудак', 'говно', 'сука', 
  'пидор', 'лох', 'долбоёб', 'хуесос', 'гнида', 'тварь', 'шлюха', 
  'блядина', 'хуйло', 'еблан', 'уебан', 'педераст', 'редиска', 'пиздец',
  'нахуй', 'похуй', 'ебаный', 'ебаться', 'сволочь', 'падла', 'ублюдок'
];

const spamWords = [
  'реклама', 'заработок', 'казино', 'бонус', 'скидка', 'акция', 
  'промокод', 'реферал', 'зарплата', 'деньги', 'биткоин', 'лотерея',
  'розыгрыш', 'конкурс', 'бесплатно', 'кэшбэк'
];

const allowedDomains = [
  'grnd.gg', 'grandmobile.ru', 'rustore.ru', 'apps.apple.com',
  'play.google.com', 'discord.gg', 't.me/grandmobile', 'youtube.com', 'youtu.be'
];

const filterBadWords = (text) => {
  let filtered = text;
  badWords.forEach(word => {
    const regex = new RegExp(word, 'gi');
    filtered = filtered.replace(regex, '***');
  });
  return filtered;
};

const filterSpam = (text) => {
  let filtered = text;
  spamWords.forEach(word => {
    const regex = new RegExp(word, 'gi');
    filtered = filtered.replace(regex, `[${word}]`);
  });
  return filtered;
};

const filterLinks = (text) => {
  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
  const matches = text.match(urlRegex);
  if (!matches) return text;
  let filtered = text;
  matches.forEach(url => {
    const isAllowed = allowedDomains.some(domain => url.includes(domain));
    if (!isAllowed) {
      filtered = filtered.replace(url, '[ссылка скрыта]');
    }
  });
  return filtered;
};

export const censorText = (text) => {
  if (!text) return text;
  let result = text;
  result = filterBadWords(result);
  result = filterSpam(result);
  result = filterLinks(result);
  return result;
};