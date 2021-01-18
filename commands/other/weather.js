const { Command } = require('discord.js-commando');
const { openWeatherKey } = require('../../config.json');
const { MessageEmbed } = require('discord.js');
const weather = require('openweather-apis');

// Skips loading if not found in config.json and posts console message
if (openWeatherKey == null)
  return console.log(
    'INFO: Weather command removed from the list. \nMake sure you have "openWeatherKey" in your config.json to use the Weather command!'
  );

module.exports = class WeatherCommand extends Command {
  constructor(client) {
    super(client, {
      name: 'weather',
	  aliases: ['w'],
      memberName: 'weather',
      group: 'other',
      description: 'Get the current weather in a city.',
      throttling: {
        usages: 3,
        duration: 60
      },
      args: [
        {
          key: 'cityName',
          prompt: 'Which city are you interested in?.',
          type: 'string',
          validate: function isNumeric(cityName) {
            return /^\D+$/.test(cityName);
          }
        }
      ]
    });
  }

  run(message, { cityName }) {
    weather.setLang('zh_TW');
    weather.setCity(cityName);
    weather.setUnits('metric');

    // check http://openweathermap.org/appid#get for get the APPID
    weather.setAPPID(openWeatherKey);

    // get all the JSON file returned from server (rich of info)
    try {
      weather.getAllWeather(function queryData(err, JSONObj) {
		if (JSONObj == null)
		  return message.reply(':x: 輸入錯誤(你是不是輸入了中文?)');
        if (JSONObj.cod == '404')
          return message.reply(':x: 找不到相符的城市名稱');
        if (JSONObj.cod == '429')
          return message.reply(':x: Weather Api Limit Exceeded.');
        if (err) {
          message.reply(':x: There was a problem with your request.');
          return console.error(err);
        }

        // Compass Conversion
        function degToCompass(num) {
          var val = Math.floor(num / 22.5 + 0.5);
          var arr = [
            '北 :arrow_up:',
            '北北東 :arrow_upper_right:',
            '東北 :arrow_upper_right:',
            '東北東 :arrow_upper_right:',
            '東 :arrow_right:',
            '東南東 :arrow_lower_right:',
            '東南 :arrow_lower_right:',
            '南南東 :arrow_lower_right:',
            '南 :arrow_down:',
            '南南西 :arrow_lower_left:',
            '西南 :arrow_lower_left:',
            '西南西 :arrow_lower_left:',
            '西 :arrow_left:',
            '西北西 :arrow_upper_left:',
            '西北 :arrow_upper_left:',
            '北北西 :arrow_upper_left:'
          ];
          return arr[val % 16];
        }
        console.log(JSONObj);

        //Weather Embed
        const embed = new MessageEmbed()
          .setAuthor(
            '當前 ' + JSONObj.name + ', ' + JSONObj.sys.country + ' 的天氣資訊',
            `https://openweathermap.org/themes/openweathermap/assets/vendor/owm/img/icons/logo_60x60.png`
          )
          .setDescription('**' + JSONObj.weather[0].description + '**')
          .setColor('#48484A')
          .setThumbnail(
            `http://openweathermap.org/img/wn/` +
              JSONObj.weather[0].icon +
              '@2x.png'
          )
          .addField(
            ':thermometer: 當前氣溫',
            JSONObj.main.temp +
              '°C (*' +
              (JSONObj.main.temp*5/9+32).toFixed(2) +
              '°F* )\n' +
              '**體感溫度**\n' +
              JSONObj.main.feels_like +
              '°C (*' +
              (JSONObj.main.feels_like*5/9+32).toFixed(2) +
              '°F* )\n' +
              '**相對濕度**\n' +
              JSONObj.main.humidity +
              '%\n',
            true
          )
          .addField('\u200b', '\u200b', true)
          .addField(
            ':wind_blowing_face: 風向資訊',
            JSONObj.wind.speed +
              ' m/s' +
              ' (*' +
              (JSONObj.wind.speed * 3.6).toFixed(2) +
              ' km/h* )\n**' +
              degToCompass(JSONObj.wind.deg) +
              '** ( *' +
              JSONObj.wind.deg +
              '°* )',
            true
          )
          .addField(
            '氣壓',
			  JSONObj.main.pressure +
              ' hPa (*' +
              (JSONObj.main.pressure * 0.7502467917).toFixed(2) +
              ' mmHg* )\n' +
              '**雲量**\n' +
              JSONObj.clouds.all +
              '%'
          )
          .setFooter('Powered by openweathermap.org')
          .setTimestamp();

        // Send Embed
        message.say(embed);
      });
    } catch (e) {
      message.say(':x: Something went wrong!\n' + e);
    }
  }
};