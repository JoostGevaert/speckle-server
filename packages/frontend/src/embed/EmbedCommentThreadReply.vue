<template>
  <div class="d-flex">
    <div
      :class="`d-inline-block ${$userId() === reply.authorId ? 'xxx-order-last' : ''}`"
    >
      <user-avatar :id="reply.authorId" :size="30" />
    </div>
    <div
      :class="`pink reply-box d-inline-block mx-2 py-2 flex-grow-1 float-left caption`"
    >
      <smart-text-editor
        v-if="reply.text.doc"
        min-width
        read-only
        :schema-options="richTextSchema"
        :value="reply.text.doc"
      />
      <comment-thread-reply-attachments
        v-if="reply.text.attachments && reply.text.attachments.length"
        :attachments="reply.text.attachments"
        :primary="$userId() === reply.authorId"
      />
    </div>
  </div>
</template>
<script>
import SmartTextEditor from '@/main/components/common/text-editor/SmartTextEditor.vue'
import { SMART_EDITOR_SCHEMA } from '@/main/lib/viewer/comments/commentsHelper'
import CommentThreadReplyAttachments from '@/main/components/comments/CommentThreadReplyAttachments.vue'

export default {
  name: 'CommentThreadViewer',
  components: {
    UserAvatar: () => import('@/main/components/common/UserAvatar'),
    SmartTextEditor,
    CommentThreadReplyAttachments
  },
  props: {
    reply: { type: Object, default: () => null }
  },
  data() {
    return {
      richTextSchema: SMART_EDITOR_SCHEMA
    }
  },
  methods: {}
}
</script>
