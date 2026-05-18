import {
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead
} from "./notifications.service.js";

export async function getNotifications(req, res, next) {
  try {
    res.json(await listNotifications(req.query || {}, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function getNotificationsUnreadCount(req, res, next) {
  try {
    res.json(await getUnreadCount(req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function patchNotificationRead(req, res, next) {
  try {
    res.json(await markNotificationRead(req.params.id, req.auth || {}));
  } catch (error) {
    next(error);
  }
}

export async function patchNotificationsReadAll(req, res, next) {
  try {
    res.json(await markAllNotificationsRead(req.auth || {}));
  } catch (error) {
    next(error);
  }
}
