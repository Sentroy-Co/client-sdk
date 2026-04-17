<?php

namespace Sentroy\ClientSdk;

class Inbox
{
    /** @var HttpClient */
    private $http;

    public function __construct(HttpClient $http)
    {
        $this->http = $http;
    }

    /**
     * List messages in a mailbox folder.
     *
     * @param array $params {mailbox, folder, page, limit, unreadOnly}
     * @return array
     */
    public function getAll(array $params = array())
    {
        $query = array();
        if (isset($params['mailbox'])) $query['mailbox'] = $params['mailbox'];
        if (isset($params['folder'])) $query['folder'] = $params['folder'];
        if (isset($params['page'])) $query['page'] = $params['page'];
        if (isset($params['limit'])) $query['limit'] = $params['limit'];
        if (!empty($params['unreadOnly'])) $query['unreadOnly'] = 'true';

        return $this->http->get('/inbox', $query);
    }

    /**
     * Get a single message detail.
     *
     * @param int   $uid
     * @param array $options {mailbox, folder}
     * @return array
     */
    public function get($uid, array $options = array())
    {
        $query = array();
        if (isset($options['mailbox'])) $query['mailbox'] = $options['mailbox'];
        if (isset($options['folder'])) $query['folder'] = $options['folder'];

        return $this->http->get('/inbox/' . $uid, $query);
    }

    /**
     * List IMAP folders for a given email account.
     *
     * @param string|null $mailbox
     * @return array
     */
    public function listFolders($mailbox = null)
    {
        $query = array();
        if ($mailbox !== null) $query['mailbox'] = $mailbox;

        return $this->http->get('/inbox/mailboxes', $query);
    }

    /**
     * Get thread messages by subject.
     *
     * @param string      $subject
     * @param string|null $mailbox
     * @return array
     */
    public function getThread($subject, $mailbox = null)
    {
        $query = array('subject' => $subject);
        if ($mailbox !== null) $query['mailbox'] = $mailbox;

        return $this->http->get('/inbox/thread', $query);
    }

    /**
     * Mark a message as read.
     *
     * @param int   $uid
     * @param array $options {mailbox, folder}
     * @return void
     */
    public function markAsRead($uid, array $options = array())
    {
        $this->http->post('/inbox/' . $uid . '/read', array(
            'mailbox' => isset($options['mailbox']) ? $options['mailbox'] : null,
            'folder' => isset($options['folder']) ? $options['folder'] : null,
        ));
    }

    /**
     * Mark a message as unread.
     *
     * @param int   $uid
     * @param array $options {mailbox, folder}
     * @return void
     */
    public function markAsUnread($uid, array $options = array())
    {
        $query = array();
        if (isset($options['mailbox'])) $query['mailbox'] = $options['mailbox'];
        if (isset($options['folder'])) $query['folder'] = $options['folder'];

        $this->http->delete('/inbox/' . $uid . '/read', $query);
    }

    /**
     * Move a message to another folder.
     *
     * @param int    $uid
     * @param string $to
     * @param array  $options {from, mailbox}
     * @return void
     */
    public function move($uid, $to, array $options = array())
    {
        $this->http->post('/inbox/' . $uid . '/move', array(
            'to' => $to,
            'from' => isset($options['from']) ? $options['from'] : null,
            'mailbox' => isset($options['mailbox']) ? $options['mailbox'] : null,
        ));
    }

    /**
     * Delete a message.
     *
     * @param int   $uid
     * @param array $options {mailbox, folder}
     * @return void
     */
    public function delete($uid, array $options = array())
    {
        $query = array();
        if (isset($options['mailbox'])) $query['mailbox'] = $options['mailbox'];
        if (isset($options['folder'])) $query['folder'] = $options['folder'];

        $this->http->delete('/inbox/' . $uid, $query);
    }
}
