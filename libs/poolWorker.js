var Server = require('stratum').Server;

const server = new Server();

server.on('mining', function(req, deferred, socket){
  // req is {method:"", id:0, params: []}

  // this may seem counter intuitive to some people
  // but working with deferred is the most powerful
  // way to create maintainable code (along with decoupling
  // using events)

  // The deferred parameter must be resolve'd if the data
  // is correct, and reject'ed if anything went wrong.

  // Always resolve or reject using an array instead of
  // parameters

  // the socket parameter is the Client class, if you need
  // anything with it (closing, sending raw data, etc),
  // you can authorize, change the currentId, fetch socket id,
  // etc

  switch (req.method) {
    case 'subscribe':
      console.log('Client is asking for subscription!');
      // returns a mining.notify command to the client
      //
      // Resolve the deferred, so the command is sent to the socket

      deferred
        .resolve([
          'b4b6693b72a50c7116db18d6497cac52',  // difficulty
          'ae6812eb4cd7735a302a8a9dd95cf71f',  // subscription_id
          '08000002',                          // extranonce1
          4                                    // extranonce2_size
        ]);

      // the resulting command will be [[["mining.set_difficulty", "b4b6693b72a50c7116db18d6497cac52"], ["mining.notify", "ae6812eb4cd7735a302a8a9dd95cf71f"]], "08000002", 4]

      // you may send an error to the client by rejecting the deferred
      // deferred.reject(Server.errors.UNKNOWN);
      break;
    case 'authorize':
      console.log('Authorizing worker ' + req.params[0]);

      // true = authorized or false = not authorized
      deferred.resolve([true]);

      // If you need to call other methods on the current socket

      // notice that these two functions (set_difficulty and notify)
      // are called before the deferred, make sure a racing condition won't happen
      deferred.promise.then(function(){
        socket.set_difficulty(['b4b6693b72a50c7116db18d6497cac52']).then(function(){
          console.log('Sent difficulty');
        }, function(){
          console.log('Failed to send difficulty');
        });

        //SCRYPT
        socket.notify([
          'bf',      // job_id
          'b61b385ce17b7f9e4d1586ee0cfa7bc0778fe63bffe0240bd9d228f2829b7f0b', // previous_hash
          '01000000010000000000000000000000000000000000000000000000000000000000000000ffffffff2303700706062f503253482f042a91f15108', // coinbase1
          '092f7374726174756d2f00000000018091db2a010000001976a914e63c288f379eea1a32305932d957d70b69e21dff88ac00000000',         // coinbase2
          ['4d31368c61b556105d936a0bf2f7d772e19375d2997fbf8d9eae5c5e089b2910', '012b5c89cff28de2400d192a3d8ed55b5d19f026f77d95838b3af2aefd0304a4'], // branches
          '00000001', // block_version
          '1b494a04', // nbit
          '51f1912a', // ntime
          true        // clean

        ]).then(function(){
          console.log('Sent work');
        }, function(){
          console.log('Failed to send work');
        });
      });

      // job_id, previous_hash, coinbase1, coinbase2, branches, block_version, nbit, ntime, clean
      // SHA256
      /*socket.notify([
        'bf',
        '00000000d48a84c146910cfff0c9fd37052ec4c220e083a37ec9a09964e77d2d',
        '01000000010000000000000000000000000000000000000000000000000000000000000000ffffffff20020862062f503253482f04b8864e5008',
        '072f736c7573682f000000000100f2052a010000001976a914d23fcdf86f7e756a64a7a9688ef9903327048ed988ac00000000',
         [
          '61e90d4998b4a30d5a939e7e8b9a77d0b6abae6d30e827d00a45b57052cc6812'
         ],
        '00000002',
        'ffff001d',
        'e8dc3c50',
        false
      ]).then(function(){
        console.log('Sent work');
      }, function(){
        console.log('Failed to send work');
      });*/

      break;
    case 'submit':
      // randomly accept or rejects shares, just for example purposes
      if (Math.random() * 10 + 1 < 3.141516) {
        deferred.resolve([false]);
      } else {
        deferred.resolve([true]);
      }
      break;
    case 'get_transactions':
      // transparency to the masses (BFGMiner asks for this), you can return an error using reject
      deferred.reject(Server.errors.METHOD_NOT_FOUND);
      break;
    default:
      // reject is the Deferred reject function, sends an error to the socket

      // this will never be reached, since the server checks if the method
      // is valid before emitting the 'mining' event.

      // This error SHOULD go directly to mining.error (or it's a flaw in the code)
      deferred.reject(Server.errors.METHOD_NOT_FOUND);
  }
});

// This event is emitted when an error directly related to mining is raised
server.on('mining.error', function(error, socket){
  console.log('Mining error: ', error);
});

// Server emits rpc events when it receives communication from outside (usually from blocknotify)
// for this test, use on the command line:

// node ./bin/stratum-notify --host localhost --port 1337 --password password --type wallet --source bitcoin --data "DATA"
server.on('rpc', function(name, args, connection, deferred){
  // these two come out of the box, but you may add your own functions as well
  // using server.rpc.expose('name', function(){}, context);

  console.log(name, args);
  // args is ['hash','daemonname']

  switch (name) {
    case 'mining.connections':
      // "someone" is asking for the connections on this app, let's return the ids
      deferred.resolve([
        this.lodash.map(server.clients, function(client){
          return {id: client.id, ip: client.address().address };
        })
      ]); // always resolve using array

      // or we can deny it
      deferred.reject(['Im not showing it to you']);

      break;
    case 'mining.wallet':
      // walletnotify
      deferred.resolve(['uhum']);
      break;
    case 'mining.alert':
      // alertnotify
      deferred.resolve(['gotcha']);
      break;
    case 'mining.block':
      // bitcoind is sending us a new block, there's no need to answer with
      // real data, unless the other end if doing some log

      deferred.resolve(['Block updated']); // always resolve using array
      break;
    default:
      deferred.reject(['invalid command']);
  }
});

// broadcast can be either set_difficulty or notify
// (other commands need an ID, so depends on method requests from server),
// and they are silently rejected

/*
setTimeout(function broadcast(){
  server.broadcast('notify', [
    'bf',
    '00000000d48a84c146910cfff0c9fd37052ec4c220e083a37ec9a09964e77d2d',
    '01000000010000000000000000000000000000000000000000000000000000000000000000ffffffff20020862062f503253482f04b8864e5008',
    '072f736c7573682f000000000100f2052a010000001976a914d23fcdf86f7e756a64a7a9688ef9903327048ed988ac00000000',
     [
      '61e90d4998b4a30d5a939e7e8b9a77d0b6abae6d30e827d00a45b57052cc6812'
     ],
    '00000002',
    'ffff001d',
    'e8dc3c50',
    false
  ]).then(
    function(total){
      console.log('Broadcasted new work ' + total + ' clients');
    }, function(err){
      console.log('Cant broadcast: ' + err);
    }
  );
}, 150000); */

server.listen().done(function(msg){
  console.log(msg);
});

/*var Stratum = require('stratum-pool');
var redis   = require('redis');
var net     = require('net');

var MposCompatibility = require('./mposCompatibility.js');
var ShareProcessor = require('./shareProcessor.js');

module.exports = function(logger){

    var _this = this;

    var portalConfig = JSON.parse(process.env.portalConfig);
    var poolConfig  = portalConfig.pool;
    var forkId = process.env.forkId;

    var proxySwitch = {};

    var redisClient = redis.createClient(portalConfig.redis.port, portalConfig.redis.host);

    //Handle messages from master process sent via IPC
    process.on('message', function(message) {
        switch(message.type){

            case 'banIP':
                for (var p in pools){
                    if (pools[p].stratumServer)
                        pools[p].stratumServer.addBannedIP(message.ip);
                }
                break;

            case 'blocknotify':

                var messageCoin = message.coin.toLowerCase();
                var poolTarget = Object.keys(pools).filter(function(p){
                    return p.toLowerCase() === messageCoin;
                })[0];

                if (poolTarget)
                    pools[poolTarget].processBlockNotify(message.hash, 'blocknotify script');

                break;

        }
    });

    var logSystem = 'Pool';
    var logComponent = poolConfig.coin.name;
    var logSubCat = 'Thread ' + (parseInt(forkId) + 1);

    var handlers = {
        auth: function(){},
        share: function(){},
        diff: function(){}
    };

    //Functions required for internal payment processing
    var shareProcessor = new ShareProcessor(logger, portalConfig);

    handlers.auth = function(port, workerName, password, authCallback){
        if (poolConfig.validateWorkerUsername !== true)
             authCallback(true);
        else {
             if (workerName.length === 40) {
                try {
                    new Buffer(workerName, 'hex');
                    authCallback(true);
                }
                catch (e) {
                    authCallback(false);
                }
            }
            else {
                pool.daemon.cmd('validateaddress', [workerName], function (results) {
                    var isValid = results.filter(function (r) {
                        return r.response.isvalid
                    }).length > 0;
                    authCallback(isValid);
                });
            }
        }
    };


    handlers.share = function(isValidShare, isValidBlock, data){
        shareProcessor.handleShare(isValidShare, isValidBlock, data);
    };

    var authorizeFN = function (ip, port, workerName, password, callback) {
        handlers.auth(port, workerName, password, function(authorized){

            var authString = authorized ? 'Authorized' : 'Unauthorized ';

            logger.debug(logSystem, logComponent, logSubCat, authString + ' ' + workerName + ':' + password + ' [' + ip + ']');
            callback({
                error: null,
                authorized: authorized,
                disconnect: false
            });
        });
    };


    var pool = Stratum.createPool(poolConfig, authorizeFN, logger);
    pool.on('share', function(isValidShare, isValidBlock, data){

        var shareData = JSON.stringify(data);

        if (data.blockHash && !isValidBlock)
            logger.debug(logSystem, logComponent, logSubCat, 'We thought a block was found but it was rejected by the daemon, share data: ' + shareData);

        else if (isValidBlock)
            logger.debug(logSystem, logComponent, logSubCat, 'Block found: ' + data.blockHash + ' by ' + data.worker);

        if (isValidShare) {
            if(data.shareDiff > 1000000000)
                logger.debug(logSystem, logComponent, logSubCat, 'Share was found with diff higher than 1.000.000.000!');
            else if(data.shareDiff > 1000000)
                logger.debug(logSystem, logComponent, logSubCat, 'Share was found with diff higher than 1.000.000!');
            logger.debug(logSystem, logComponent, logSubCat, 'Share accepted at diff ' + data.difficulty + '/' + data.shareDiff + ' by ' + data.worker + ' [' + data.ip + ']' );

        } else if (!isValidShare)
            logger.debug(logSystem, logComponent, logSubCat, 'Share rejected: ' + shareData);

        handlers.share(isValidShare, isValidBlock, data)


    }).on('difficultyUpdate', function(workerName, diff){
        logger.debug(logSystem, logComponent, logSubCat, 'Difficulty update to diff ' + diff + ' workerName=' + JSON.stringify(workerName));
        handlers.diff(workerName, diff);
    }).on('log', function(severity, text) {
        logger[severity](logSystem, logComponent, logSubCat, text);
    }).on('banIP', function(ip, worker){
        process.send({type: 'banIP', ip: ip});
    }).on('started', function(){
        _this.setDifficultyForProxyPort(pool, poolOptions.coin.name, poolOptions.coin.algorithm);
    });

    pool.start();*/

    /*this.getFirstPoolForAlgorithm = function(algorithm) {
        return foundCoin;
    };*/
//};
