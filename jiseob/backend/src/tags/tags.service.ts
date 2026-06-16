import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { Tag } from './entities/tag.entity';

export type TagResponse = {
  id: string;
  name: string;
};

@Injectable()
export class TagsService {
  constructor(
    @InjectRepository(Tag)
    private readonly tagsRepository: Repository<Tag>,
  ) {}

  async findAll(): Promise<TagResponse[]> {
    const tags = await this.tagsRepository.find({
      order: { name: 'ASC' },
    });

    return tags.map((tag) => this.toTagResponse(tag));
  }

  async findOrCreateByNames(names: string[] | undefined, manager?: EntityManager): Promise<Tag[]> {
    const normalizedNames = this.normalizeTagNames(names);

    if (normalizedNames.length === 0) {
      return [];
    }

    const repository = manager?.getRepository(Tag) ?? this.tagsRepository;
    const existingTags = await repository.find({
      where: { name: In(normalizedNames) },
    });
    const existingTagNames = new Set(existingTags.map((tag) => tag.name));
    const newTags = normalizedNames
      .filter((name) => !existingTagNames.has(name))
      .map((name) => repository.create({ name }));
    const savedNewTags = newTags.length > 0 ? await repository.save(newTags) : [];

    return [...existingTags, ...savedNewTags].sort((left, right) =>
      left.name.localeCompare(right.name),
    );
  }

  normalizeTagNames(names: string[] | undefined): string[] {
    if (!names) {
      return [];
    }

    const normalizedNames = names.map((name) => this.normalizeTagName(name));
    const uniqueNames = [...new Set(normalizedNames)];

    if (uniqueNames.some((name) => name.length === 0)) {
      throw new BadRequestException('태그 이름은 비어 있을 수 없습니다.');
    }

    return uniqueNames;
  }

  toTagResponse(tag: Tag): TagResponse {
    return {
      id: tag.id,
      name: tag.name,
    };
  }

  private normalizeTagName(name: string): string {
    return name.trim().replace(/^#+/, '').replace(/\s+/g, ' ').toLowerCase();
  }
}
