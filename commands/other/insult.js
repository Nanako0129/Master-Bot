const fetch = require('node-fetch');
const { Command } = require('discord.js-commando');
const { MessageEmbed } = require('discord.js');

module.exports = class InsultCommand extends Command {
  constructor(client) {
    super(client, {
      name: 'insult',
      group: 'other',
      memberName: 'insult',
      description: 'Generate an evil insult!',
      throttling: {
        usages: 1,
        duration: 6
      }
    });
  }

  run(message) {
    // thanks to https://evilinsult.com :)
    fetch('https://evilinsult.com/generate_insult.php?lang=en&type=json')
      .then(res => res.json())
      .then(json => {
        const embed = new MessageEmbed()
          .setColor('#E41032')
          .setTitle('Evil Insult :face_with_symbols_over_mouth:')
          .setDescription(json.insult)
          .setTimestamp()
          .setFooter('Powered by evilinsult.com', 'https://i.imgur.com/bOVpNAX.png');
        return message.say(embed);
      })
      .catch(err => {
        message.say(':x: Failed to deliver insult!');
        return console.error(err);
      });
  }
};
