# Создай папку _lib
mkdir api\_lib

# Создай файл censorship.js
echo const badWords = [ > api\_lib\censorship.js
echo   'хуй', 'пизда', 'бля', 'ебать', 'залупа', 'мудак', 'говно', 'сука', >> api\_lib\censorship.js
echo   'пидор', 'лох', 'долбоёб', 'хуесос', 'гнида', 'тварь', 'шлюха', >> api\_lib\censorship.js
echo   'блядина', 'хуйло', 'еблан', 'уебан', 'педераст', 'редиска', 'пиздец', >> api\_lib\censorship.js
echo   'нахуй', 'похуй', 'ебаный', 'ебаться', 'сволочь', 'падла', 'ублюдок' >> api\_lib\censorship.js
echo ]; >> api\_lib\censorship.js
echo. >> api\_lib\censorship.js
echo const spamWords = [ >> api\_lib\censorship.js
echo   'реклама', 'заработок', 'казино', 'бонус', 'скидка', 'акция', >> api\_lib\censorship.js
echo   'промокод', 'реферал', 'зарплата', 'деньги', 'биткоин', 'лотерея', >> api\_lib\censorship.js
echo   'розыгрыш', 'конкурс', 'бесплатно', 'кэшбэк' >> api\_lib\censorship.js
echo ]; >> api\_lib\censorship.js
echo. >> api\_lib\censorship.js
echo const allowedDomains = [ >> api\_lib\censorship.js
echo   'grnd.gg', 'grandmobile.ru', 'rustore.ru', 'apps.apple.com', >> api\_lib\censorship.js
echo   'play.google.com', 'discord.gg', 't.me/grandmobile', 'youtube.com', 'youtu.be' >> api\_lib\censorship.js
echo ]; >> api\_lib\censorship.js
echo. >> api\_lib\censorship.js
echo const filterBadWords = (text) => { >> api\_lib\censorship.js
echo   let filtered = text; >> api\_lib\censorship.js
echo   badWords.forEach(word => { >> api\_lib\censorship.js
echo     const regex = new RegExp(word, 'gi'); >> api\_lib\censorship.js
echo     filtered = filtered.replace(regex, '***'); >> api\_lib\censorship.js
echo   }); >> api\_lib\censorship.js
echo   return filtered; >> api\_lib\censorship.js
echo }; >> api\_lib\censorship.js
echo. >> api\_lib\censorship.js
echo const filterSpam = (text) => { >> api\_lib\censorship.js
echo   let filtered = text; >> api\_lib\censorship.js
echo   spamWords.forEach(word => { >> api\_lib\censorship.js
echo     const regex = new RegExp(word, 'gi'); >> api\_lib\censorship.js
echo     filtered = filtered.replace(regex, `[${word}]`); >> api\_lib\censorship.js
echo   }); >> api\_lib\censorship.js
echo   return filtered; >> api\_lib\censorship.js
echo }; >> api\_lib\censorship.js
echo. >> api\_lib\censorship.js
echo const filterLinks = (text) => { >> api\_lib\censorship.js
echo   const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi; >> api\_lib\censorship.js
echo   const matches = text.match(urlRegex); >> api\_lib\censorship.js
echo   if (!matches) return text; >> api\_lib\censorship.js
echo   let filtered = text; >> api\_lib\censorship.js
echo   matches.forEach(url => { >> api\_lib\censorship.js
echo     const isAllowed = allowedDomains.some(domain => url.includes(domain)); >> api\_lib\censorship.js
echo     if (!isAllowed) filtered = filtered.replace(url, '[ссылка скрыта]'); >> api\_lib\censorship.js
echo   }); >> api\_lib\censorship.js
echo   return filtered; >> api\_lib\censorship.js
echo }; >> api\_lib\censorship.js
echo. >> api\_lib\censorship.js
echo export const censorText = (text) => { >> api\_lib\censorship.js
echo   if (!text) return text; >> api\_lib\censorship.js
echo   let result = text; >> api\_lib\censorship.js
echo   result = filterBadWords(result); >> api\_lib\censorship.js
echo   result = filterSpam(result); >> api\_lib\censorship.js
echo   result = filterLinks(result); >> api\_lib\censorship.js
echo   return result; >> api\_lib\censorship.js
echo }; >> api\_lib\censorship.js