const { Command } = require('discord.js-commando');
const { MessageEmbed } = require('discord.js');
const Youtube = require('simple-youtube-api');
const ytdl = require('ytdl-core');
const { youtubeAPI } = require('../../config.json');
const youtube = new Youtube(youtubeAPI);
const db = require('quick.db');
const { getInfo } = require('ytdl-core');

module.exports = class PlayCommand extends Command {
  constructor(client) {
    super(client, {
      name: 'play',
      aliases: ['play-song', 'add', 'p'],
      memberName: 'play',
      group: 'music',
      description: '播放Youtube上的任何音樂與播放清單！',
      guildOnly: true,
      clientPermissions: ['SPEAK', 'CONNECT'],
      throttling: {
        usages: 2,
        duration: 5
      },
      args: [
        {
          key: 'query',
          prompt: ':notes: 你想播放什麼歌曲或播放清單？',
          type: 'string',
          validate: function(query) {
            return query.length > 0 && query.length < 200;
          }
        }
      ]
    });
  }

  async run(message, { query }) {
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) {
      message.say(':no_entry: 請進入語音頻道後再試一次！');
      return;
    }

    if (message.guild.triviaData.isTriviaRunning == true) {
      message.say(':x: Please try after the trivia has ended!');
      return;
    }
    /*
     [
      { name: '1', urls: [ [Object], [Object] ] },
      { name: '2', urls: [ [Object], [Object], [Object] ] },
      { name: '3', urls: [ [Object], [Object] ] }
     ]
    */

    if (db.get(message.member.id) !== null) {
      const userPlaylists = db.get(message.member.id).savedPlaylists;
      let found = false;
      let location;
      for (let i = 0; i < userPlaylists.length; i++) {
        if (userPlaylists[i].name == query) {
          found = true;
          location = i;
          break;
        }
      }
      if (found) {
        const embed = new MessageEmbed()
          .setColor('#ff0000')
          .setTitle(':eyes: 想確認一下...')
          .setDescription(
            `你有個播放清單也名為 **${query}**，請問你是要播放這個清單呢？還是在YouTube上搜尋 **${query}** 呢？`
          )
          .addField(':arrow_forward: Playlist', '1. 播放此清單')
          .addField(':mag: YouTube', '2. 在YouTube上搜尋')
          .addField(':x: Cancel', '3. 取消')
          .setFooter('請輸入數字 1 到 3 來執行');
        const clarifyEmbed = await message.channel.send({ embed });
        message.channel
          .awaitMessages(
            function onMessage(msg) {
              return msg.content > 0 && msg.content < 4;
            },
            {
              max: 1,
              time: 30000,
              errors: ['time']
            }
          )
          .then(async function onClarifyResponse(response) {
            const msgContent = response.first().content;
            if (msgContent == 1) {
              if (clarifyEmbed) {
                clarifyEmbed.delete();
              }
              const urlsArray = userPlaylists[location].urls;
              if (urlsArray.length == 0) {
                message.reply(
                  `播放清單 ${query} 是空的喔！`
                );
                return;
              }
              for (let i = 0; i < urlsArray.length; i++) {
                message.guild.musicData.queue.push(urlsArray[i]);
              }
              if (message.guild.musicData.isPlaying == true) {
                message.channel.send(
                  `播放清單 **${query} 已被加入播放隊列**`
                );
              } else if (message.guild.musicData.isPlaying == false) {
                message.guild.musicData.isPlaying = true;
                PlayCommand.playSong(message.guild.musicData.queue, message);
              }
            } else if (msgContent == 2) {
              await PlayCommand.searchYoutube(query, message, voiceChannel);
              return;
            } else if (msgContent == 3) {
              clarifyEmbed.delete();
              return;
            }
          })
          .catch(function onClarifyError() {
            if (clarifyEmbed) {
              clarifyEmbed.delete();
            }
            return;
          });
        return;
      }
    }

    if (
      // Handles PlayList Links
      query.match(
        /^(?!.*\?.*\bv=)https:\/\/(www|music)\.youtube\.com\/.*\?.*\blist=.*$/
      )
    ) {
      const playlist = await youtube.getPlaylist(query).catch(function() {
        message.say(':x: 此播放清單可能是私人的或不存在！');
        return;
      });
      // add 10 as an argument in getVideos() if you choose to limit the queue
      const videosArr = await playlist.getVideos().catch(function() {
        message.say(
          ':x: 歌單中有一首歌出現問題！'
        );
        return;
      });

      // Uncommented if you want to shuffle the playlist

      /*for (let i = videosArr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [videosArr[i], videosArr[j]] = [videosArr[j], videosArr[i]];
      }
      */

      for (let i = 0; i < videosArr.length; i++) {
        if (
          videosArr[i].raw.status.privacyStatus == 'private' ||
          videosArr[i].raw.status.privacyStatus == 'privacyStatusUnspecified'
        ) {
          continue;
        } else {
          try {
            const video = await videosArr[i].fetch();
            // this can be uncommented if you choose to limit the queue
            // if (message.guild.musicData.queue.length < 10) {
            //
            message.guild.musicData.queue.push(
              PlayCommand.constructSongObj(
                video,
                voiceChannel,
                message.member.user
              )
            );
            // } else {
            //   return message.say(
            //     `I can't play the full playlist because there will be more than 10 songs in queue`
            //   );
            // }
          } catch (err) {
            return console.error(err);
          }
        }
      }
      if (message.guild.musicData.isPlaying == false) {
        message.guild.musicData.isPlaying = true;
        return PlayCommand.playSong(message.guild.musicData.queue, message);
      } else if (message.guild.musicData.isPlaying == true) {
        const PlayListEmbed = new MessageEmbed()
          .setColor('#ff0000')
          .setTitle(`:musical_note: ${playlist.title}`)
          .addField(
            `已加入 ${message.guild.musicData.queue.length} 首歌到播放隊列！`,
            playlist.url
          )
          .setThumbnail(playlist.thumbnails.maxres.url)
          .setURL(playlist.url);
        message.say(PlayListEmbed);
        // @TODO add the the position number of queue of the when a playlist is added
        return;
      }
    }

    // This if statement checks if the user entered a youtube url, it can be any kind of youtube url
    if (
      query.match(/^(http(s)?:\/\/)?(m.)?(music.)?((w){3}.)?youtu(be|.be)?(\.com)?\/.+/)
    ) {
      query = query
        .replace(/(>|<)/gi, '')
        .split(/(vi\/|v=|\/v\/|youtu\.be\/|\/embed\/)/);
      const id = query[2].split(/[^0-9a-z_\-]/i)[0];
      let failedToGetVideo = false;
      const video = await youtube.getVideoByID(id).catch(function() {
        message.say(':x: 在擷取你提供的影片時，出現了問題！');
        failedToGetVideo = true;
      });
      if (failedToGetVideo) return;
      // // can be uncommented if you don't want the bot to play live streams
      // if (video.raw.snippet.liveBroadcastContent === 'live') {
      //   return message.say("I don't support live streams!");
      // }
      // // can be uncommented if you don't want the bot to play videos longer than 1 hour
      // if (video.duration.hours !== 0) {
      //   return message.say('I cannot play videos longer than 1 hour');
      // }
      // // can be uncommented if you want to limit the queue
      // if (message.guild.musicData.queue.length > 10) {
      //   return message.say(
      //     'There are too many songs in the queue already, skip or wait a bit'
      //   );
      // }
      message.guild.musicData.queue.push(
        PlayCommand.constructSongObj(video, voiceChannel, message.member.user)
      );
      if (
        message.guild.musicData.isPlaying == false ||
        typeof message.guild.musicData.isPlaying == 'undefined'
      ) {
        message.guild.musicData.isPlaying = true;
        return PlayCommand.playSong(message.guild.musicData.queue, message);
      } else if (message.guild.musicData.isPlaying == true) {
        const addedEmbed = new MessageEmbed()
          .setColor('#ff0000')
          .setTitle(`:musical_note: ${video.title}`)
          .addField(
            `已加入播放隊列 `,
            `這是隊列中的 第 #${message.guild.musicData.queue.length} 首`
          )
          .setThumbnail(video.thumbnails.maxres.url)
          .setURL(video.url);
        message.say(addedEmbed);
        return;
      }
    }

    // if user provided a song/video name
    await PlayCommand.searchYoutube(query, message, voiceChannel);
  }
  static playSong(queue, message) {
    const classThis = this; // use classThis instead of 'this' because of lexical scope below
    if (queue[0].voiceChannel == undefined) {
      // happens when loading a saved playlist
      queue[0].voiceChannel = message.member.voice.channel;
    }
    if (message.guild.me.voice.channel !== null) {
      if (message.guild.me.voice.channel.id !== queue[0].voiceChannel.id) {
        queue[0].voiceChannel = message.guild.me.voice.channel;
      }
    }
    queue[0].voiceChannel
      .join()
      .then(function(connection) {
        const dispatcher = connection
          .play(
            ytdl(queue[0].url, {
              filter: 'audio',
              quality: 'highestaudio',
              highWaterMark: 1 << 25
            })
          )
          .on('start', function() {
            message.guild.musicData.songDispatcher = dispatcher;
            if (!db.get(`${message.guild.id}.serverSettings.volume`))
              dispatcher.setVolume(message.guild.musicData.volume);
            else
              dispatcher.setVolume(
                db.get(`${message.guild.id}.serverSettings.volume`)
              );

            const videoEmbed = new MessageEmbed()
              .setThumbnail(queue[0].thumbnail)
              .setColor('#ff0000')
              .addField(':notes: 正在播放：', `[${queue[0].title}](${queue[0].url})`)//add hyperlink
              .addField(':stopwatch: 長度：', queue[0].duration)
              .setURL(queue[0].url)
              .setFooter(
                `由 ${message.member.displayName} 點播!`,
                queue[0].memberAvatar
              );

            if (queue[1] && !message.guild.musicData.loopSong)
              videoEmbed.addField(':track_next: 下一首:', queue[1].title);
            message.say(videoEmbed);
            message.guild.musicData.nowPlaying = queue[0];
            queue.shift();
            return;
          })
          .on('finish', function() {
            queue = message.guild.musicData.queue;
            if (message.guild.musicData.loopSong) {
              queue.unshift(message.guild.musicData.nowPlaying);
            } else if (message.guild.musicData.loopQueue) {
              queue.push(message.guild.musicData.nowPlaying);
            }
            if (queue.length >= 1) {
              classThis.playSong(queue, message);
              return;
            } else {
              message.guild.musicData.isPlaying = false;
              message.guild.musicData.nowPlaying = null;
              message.guild.musicData.songDispatcher = null;
              if (
                message.guild.me.voice.channel &&
                message.guild.musicData.skipTimer
              ) {
                message.guild.me.voice.channel.leave();
                message.guild.musicData.skipTimer = false;
                return;
              }
              if (message.guild.me.voice.channel) {
                setTimeout(function onTimeOut() {
                  if (
                    message.guild.musicData.isPlaying == false &&
                    message.guild.me.voice.channel
                  ) {
                    message.guild.me.voice.channel.leave();
                    message.channel.send(
                      ':zzz: 哈－－嗯...唔，我想睡了... <:miku_comfy:775530102913630249>'
                    );
                  }
                }, 90000);
              }
            }
          })
          .on('error', function(e) {
            message.say(':x: 無法播放這首歌！');
            console.error(e);
            if (queue.length > 1) {
              queue.shift();
              classThis.playSong(queue, message);
              return;
            }
            message.guild.musicData.queue.length = 0;
            message.guild.musicData.isPlaying = false;
            message.guild.musicData.nowPlaying = null;
            message.guild.musicData.loopSong = false;
            message.guild.musicData.songDispatcher = null;
            message.guild.me.voice.channel.leave();
            return;
          });
      })
      .catch(function() {
        message.say(':no_entry: 我進不去你的語音頻道...好像沒有權限吶...');
        message.guild.musicData.queue.length = 0;
        message.guild.musicData.isPlaying = false;
        message.guild.musicData.nowPlaying = null;
        message.guild.musicData.loopSong = false;
        message.guild.musicData.songDispatcher = null;
        if (message.guild.me.voice.channel) {
          message.guild.me.voice.channel.leave();
        }
        return;
      });
  }

  static async searchYoutube(query, message, voiceChannel) {
    const videos = await youtube.searchVideos(query, 5).catch(async function() {
      await message.say(
        ':x: 我找不到這首歌！Nya！'
      );
      return;
    });
    if (videos.length < 5 || !videos) {
      message.say(
        `:x: 你再可以給我更明確的資訊嗎？`
      );
      return;
    }
    const vidNameArr = [];
    for (let i = 0; i < videos.length; i++) {
      vidNameArr.push(
        `${i + 1}: [${videos[i].title
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&apos;/g, "'")
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .replace(/&#39;/g, "'")}](${videos[i].shortURL})`
      );
    }
    vidNameArr.push('cancel');
    const embed = new MessageEmbed()
      .setColor('#ff0000')
      .setTitle(`:mag: 搜尋結果！`)
      .addField(':notes: 結果 1', vidNameArr[0])
      .setURL(videos[0].url)
      .addField(':notes: 結果 2', vidNameArr[1])
      .addField(':notes: 結果 3', vidNameArr[2])
      .addField(':notes: 結果 4', vidNameArr[3])
      .addField(':notes: 結果 5', vidNameArr[4])
      .setThumbnail(videos[0].thumbnails.maxres.url)
      .setFooter('請輸入數字 1 到 5 來選擇你要的結果')
      .addField(':x: Cancel', '取消');
    var songEmbed = await message.channel.send({ embed });
    message.channel
      .awaitMessages(
        function(msg) {
          return (
            (msg.content > 0 && msg.content < 6) || msg.content === 'cancel'
          );
        },
        {
          max: 1,
          time: 60000,
          errors: ['time']
        }
      )
      .then(function(response) {
        const videoIndex = parseInt(response.first().content);
        if (response.first().content === 'cancel') {
          songEmbed.delete();
          return;
        }
        youtube
          .getVideoByID(videos[videoIndex - 1].id)
          .then(function(video) {
            // // can be uncommented if you don't want the bot to play live streams
            // if (video.raw.snippet.liveBroadcastContent === 'live') {
            //   songEmbed.delete();
            //   return message.say("I don't support live streams!");
            // }

            // // can be uncommented if you don't want the bot to play videos longer than 1 hour
            // if (video.duration.hours !== 0) {
            //   songEmbed.delete();
            //   return message.say('I cannot play videos longer than 1 hour');
            // }

            // // can be uncommented if you don't want to limit the queue
            // if (message.guild.musicData.queue.length > 10) {
            //   songEmbed.delete();
            //   return message.say(
            //     'There are too many songs in the queue already, skip or wait a bit'
            //   );
            // }
            message.guild.musicData.queue.push(
              PlayCommand.constructSongObj(
                video,
                voiceChannel,
                message.member.user
              )
            );
            if (message.guild.musicData.isPlaying == false) {
              message.guild.musicData.isPlaying = true;
              if (songEmbed) {
                songEmbed.delete();
              }
              PlayCommand.playSong(message.guild.musicData.queue, message);
            } else if (message.guild.musicData.isPlaying == true) {
              if (songEmbed) {
                songEmbed.delete();
              }
              const addedEmbed = new MessageEmbed()
                .setColor('#ff0000')
                .setTitle(`:musical_note: ${video.title}`)
                .addField(
                  `已加入播放隊列 `,
                  `這是隊列中第 #${message.guild.musicData.queue.length} 首`
                )
                .setThumbnail(video.thumbnails.maxres.url)
                .setURL(video.url);
              message.say(addedEmbed);
              return;
            }
          })
          .catch(function() {
            if (songEmbed) {
              songEmbed.delete();
            }
            message.say(
              ':x: 在取得 YouTube 影片ID 時發生錯誤'
            );
            return;
          });
      })
      .catch(function() {
        if (songEmbed) {
          songEmbed.delete();
        }
        message.say(
          ':x: 請重新輸入數字 1 到 5 或 cancel'
        );
        return;
      });
  }

  static constructSongObj(video, voiceChannel, user) {
    let duration = this.formatDuration(video.duration);
    if (duration == '00:00') duration = ':red_circle: 直播';
    return {
      url: `https://www.youtube.com/watch?v=${video.raw.id}`,
      title: video.title,
      rawDuration: video.duration,
      duration,
      thumbnail: video.thumbnails.maxres.url,
      voiceChannel,
      memberDisplayName: user.username,
      memberAvatar: user.avatarURL('webp', false, 16)
    };
  }
  // prettier-ignore
  static formatDuration(durationObj) {
    const duration = `${durationObj.hours ? (durationObj.hours + ':') : ''}${
      durationObj.minutes ? durationObj.minutes : '00'
    }:${
      (durationObj.seconds < 10)
        ? ('0' + durationObj.seconds)
        : (durationObj.seconds
        ? durationObj.seconds
        : '00')
    }`;
    return duration;
  }
};
