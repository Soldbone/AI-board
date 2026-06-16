import { Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Tag } from '../../tags/entities/tag.entity';
import { Post } from './post.entity';

@Entity('post_tags')
export class PostTag {
  @PrimaryColumn({ name: 'post_id', type: 'char', length: 26 })
  postId: string;

  @PrimaryColumn({ name: 'tag_id', type: 'char', length: 26 })
  tagId: string;

  @ManyToOne(() => Post, (post) => post.postTags, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id' })
  post: Post;

  @ManyToOne(() => Tag, (tag) => tag.postTags, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tag_id' })
  tag: Tag;
}
