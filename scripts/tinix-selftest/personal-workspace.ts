// Run on an isolated database through run-ts.cjs; never writes to the real workspace.
import { initDB, getDB } from '../../service/src/db'
import { getRequestUser } from '../../service/src/utils/auth'
import * as designs from '../../service/src/db/designs'
import { addUserImage, listUserImages, deleteUserImage } from '../../service/src/db/userImages'
import { listPhotos, getPhoto } from '../../service/src/tinix/photos/core'
import router from '../../service/src/control/router'
const assert = require('assert')
const express = require('../../service/node_modules/express')

async function main() {
  initDB()
  const db = getDB()
  const owner = getRequestUser({ headers: {} })
  assert.deepEqual(getRequestUser({ headers: { authorization: 'expired-token' } }), owner)
  // Old data may belong to another account or the anonymous owner 0.
  const oldOwner = Number(db.prepare("INSERT INTO users (account,password,salt,role) VALUES ('legacy','unchanged','unchanged',0)").run().lastInsertRowid)
  const id = designs.createDesign({ user_id: oldOwner, template_id: 0, title: 'Legacy poster', data: '[]', cover: '/static/old-cover.jpg', width: 800, height: 600 })
  addUserImage(0, '/static/anonymous.jpg', 10, 10)
  addUserImage(oldOwner, '/static/legacy.jpg', 20, 20)
  const imageId = Number(db.prepare("SELECT id FROM user_images WHERE user_id=?").get(oldOwner).id)
  const beforeUsers = db.prepare('SELECT * FROM users ORDER BY id').all()
  const beforeImages = db.prepare('SELECT * FROM user_images ORDER BY id').all()
  assert.equal(designs.listDesigns(owner.id, 1, 20).total, 1)
  assert.equal(designs.getDesign(id, owner.id)!.title, 'Legacy poster')
  assert.equal(listUserImages(owner.id).length, 2)
  assert.equal(listPhotos(owner.id).length, 2)
  assert.equal(getPhoto(imageId, owner.id)!.user_id, oldOwner)
  assert.deepEqual(db.prepare('SELECT * FROM users ORDER BY id').all(), beforeUsers)
  assert.deepEqual(db.prepare('SELECT * FROM user_images ORDER BY id').all(), beforeImages)

  const app = express(); app.use(express.json()); app.use(router)
  const server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const request = async (url: string, body?: any) => {
    const response = await fetch(base + url, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    return response
  }
  try {
    const detail = await (await request(`/design/poster?id=${id}`)).json() as any
    assert.equal(detail.result.data, '[]')
    const saved = await (await request('/design/save', { id, title: 'Updated legacy', data: '[{}]', width: 800, height: 600 })).json() as any
    assert.equal(saved.result.id, id)
    assert.equal(designs.getDesign(id, owner.id)!.user_id, oldOwner)
    assert.equal(designs.getDesign(id, owner.id)!.data, '[{}]')
    const templates = await (await request('/api/admin/templates')).json() as any
    assert.equal(templates.code, 200)
    for (const url of ['/api/user/login', '/api/user/register', '/api/user/changePassword', '/api/admin/user/delete']) {
      assert.equal((await request(url, {})).status, 404, url)
    }
    assert.equal((await request('/api/admin/users')).status, 404)
    assert.deepEqual(db.prepare('SELECT * FROM users ORDER BY id').all(), beforeUsers)
    assert(deleteUserImage(imageId, owner.id))
    assert(designs.deleteDesign(id, owner.id))
    console.log('PASS: no-login read/save/delete, legacy and anonymous owners accessible, original ownership preserved, account endpoints removed')
  } finally {
    server.close()
  }
}
main().catch(error => { console.error(error); process.exit(1) })
