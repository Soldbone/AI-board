import { Column, Entity, Index, OneToMany } from 'typeorm';
import { BaseModel } from '../../common/entities/base.entity';
import { PostTag } from '../../posts/entities/post-tag.entity';

@Entity('tags')
export class Tag extends BaseModel {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 50 })
  name: string;

  @OneToMany(() => PostTag, (postTag) => postTag.tag)
  postTags: PostTag[];
}
