const fetch = require('node-fetch');
const NodeRSA = require('node-rsa');
const serviceAcc = require('../service-accounts.json');
const fs = require('fs');
const ipfsClient = require('ipfs-http-client');
const ipfs = ipfsClient({
  host: '127.0.0.1',
  port: 5001,
  protocol: 'http'
});

const priv_key = serviceAcc.key;
const key = new NodeRSA(priv_key);

const handleVoteRequest = (req,res,db)=>{
	const {vid} = req.body;
	if(!vid)
		return res.status(400).json('Provide a VoterID');
	db('storage').select('*').where({name: 'voters'})
	.then((results)=>{
		if(!results.length)
			return res.status(404).json('User not found')
		else{
			fetch(`https://ipfs.premsarswat.me/ipfs/${results[0].hash}/${vid}.json`)
			.then(encres => encres.text())
			.then(res => {
				console.log('res: ', res);
				return key.decrypt(res, 'json');
			})
			.then(userData => {
				const constituency = userData.con;
				db('storage').select('*').where({name: 'didvote'})
				.then(didVoteHash =>{
					fetch(`https://ipfs.premsarswat.me/ipfs/${didVoteHash[0].hash}/didvote.json`)
					.then(encres2 => encres2.text())
					.then(res2 => key.decrypt(res2, 'json'))
					.then(didVoteData => {
						if(didVoteData[vid])
							return res.status(401).json('Already voted');
						else {
							db('candidates').select('*').where({con: constituency})
							.then(cans => {
								let data = {
									userData,
									cans
								};
								return res.status(200).json(data);
							})
						}
					})
				})
			})
		}
	})
	.catch(err =>{
		console.log(err);
		return res.status(500).json('Some error occurred. Try again later');
	})
}

const handleVoteResponse = (req,res,db)=>{
	const {cid, vid, con} = req.body;
	if(!vid || !cid || !con)
		return res.status(400).json('Insufficient Information');
	
	db('storage').select('*').where({name: 'didvote'})
	.then(didVoteHash =>{
		fetch(`https://ipfs.premsarswat.me/ipfs/${didVoteHash[0].hash}/didvote.json`)
		.then(encres2 => encres2.text())
		.then(res2 => key.decrypt(res2, 'json'))
		.then(didVoteData => {
			didVoteData[vid] = true;
			const enc = key.encrypt(didVoteData, 'base64');
			fs.writeFile(`./uploads/storage/didvote.json`, enc, err => {
				if(err)
					console.log(err);
			})

			fetch(`https://ipfs.premsarswat.me/ipfs/${didVoteHash[0].hash}/votes.json`)
			.then(encres3 => encres3.text())
			.then(res3 => key.decrypt(res3, 'json'))
			.then(voteCount => {
				console.log(voteCount[con][cid]);
				voteCount[con][cid] += 1; 
				console.log(voteCount[con][cid]);
				ipfs.addFromFs('./uploads/storage', { recursive: true }, (err, result) => {
					if (err) { throw err }
					console.log(result)
					db('storage').update({hash: result[result.length-1].hash}).where({name: 'didvote'})
					.then(upd => {
						res.status(200).json(result[result.length-1].hash)
					})
					.catch(err =>{
						console.log(err);
						return res.status(400).json('Some error occurred. Try again later');
					})
				})
			})
		})
	})
}

module.exports={
	handleVoteRequest: handleVoteRequest,
	handleVoteResponse: handleVoteResponse
};