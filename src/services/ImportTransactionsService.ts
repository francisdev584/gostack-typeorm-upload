import csvParse from 'csv-parse';
import fs from 'fs';
import path from 'path';
import { getRepository, getCustomRepository } from 'typeorm';

import Transaction from '../models/Transaction';
import Categories from '../models/Category';
import TransactionRepository from '../repositories/TransactionsRepository';
import uploadConfig from '../config/upload';
// import AppError from '../errors/AppError';

interface Request {
  csvFilename: string;
}

interface TransactionDTO {
  title: string;
  type: 'income' | 'outcome';
  value: number;
  category: string;
}
class ImportTransactionsService {
  async execute({ csvFilename }: Request): Promise<Transaction[]> {
    // TODO
    const csvFilePath = path.join(uploadConfig.directory, csvFilename);

    const readCSVStream = fs.createReadStream(csvFilePath);

    const parseStream = csvParse({
      from_line: 2,
      ltrim: true,
      rtrim: true,
    });

    const parseCSV = readCSVStream.pipe(parseStream);

    const transactions: TransactionDTO[] = [];

    const categories: string[] = [];

    parseCSV.on('data', line => {
      const [title, type, value, category] = line;
      transactions.push({ title, type, value, category });
      categories.push(category);
    });

    await new Promise(resolve => {
      parseCSV.on('end', resolve);
    });
    const categoryRepository = getRepository(Categories);
    const categoriesFounded = await categoryRepository.find({
      where: categories.map(title => ({ title })),
    });

    const categoriesNotToCreate = categoriesFounded.map(({ title }) => title);
    const categoriesToCreate = categories
      .filter(title => !categoriesNotToCreate.includes(title)) // find not included
      .filter((value, index, self) => self.indexOf(value) === index); // delete duplicate

    const newCategories = categoryRepository.create(
      categoriesToCreate.map(title => ({
        title,
      })),
    );
    await categoryRepository.save(newCategories);

    const finalCategories = [...categoriesFounded, ...newCategories];

    const transactionsRepository = getCustomRepository(TransactionRepository);

    const createdTransactions = transactionsRepository.create(
      transactions.map(({ title, type, value, category }) => ({
        title,
        type,
        value,
        category: finalCategories.find(cat => cat.title === category),
      })),
    );

    await transactionsRepository.save(createdTransactions);

    await fs.promises.unlink(csvFilePath);

    return createdTransactions;
  }
}

export default ImportTransactionsService;
