import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import md5 from "md5";
import pg from 'pg';
import passport from "passport";
import env from "dotenv";
import session from "express-session";
import GoogleStrategy from "passport-google-oauth2";
import { Strategy } from "passport-local";

const app = express();
app.use(express.static("public"));

const db = new pg.Pool({
    database: 'Bookish',
    user: 'user',
    password: '020804',
    port: '5432',
    host: 'localhost'
})


app.use(bodyParser.urlencoded({extended: true}));

const port = 3000;
const API_KEY = "AIzaSyBRfVMUzVveYlQeKNb5KiFXur31SELSzCA";
const baseUrl = "https://www.googleapis.com/books/v1/volumes";

async function listGetter (status) {
    const result =  await db.query(`select 
        b.id, ubs.user_id, ubs.status, b.title, b.description, b.average_rating, b.page_count,b.image_link,
        ARRAY_AGG(a.name) as author
        from book_authors as ba
        join user_book_status AS ubs on ba.book_id = ubs.book_id
        join books AS b on b.id = ba.book_id
        join authors AS a on ba.author_id = a.id
        where status = $1
        GROUP BY
        b.id, ubs.user_id, ubs.status, b.title, b.description, b.average_rating, b.page_count,b.image_link`, [status]);
    return result.rows;
}

let reading = await listGetter('reading');
let read = await listGetter('read');
let wantToRead = await listGetter('wantToRead');
var recommendations = [];

app.get("/", async (req,res)=> {
    const readingResult = await db.query(`select 
        b.id, ubs.user_id, ubs.status, b.title, b.description, b.average_rating, b.page_count,b.image_link,
        ARRAY_AGG(a.name) as author
        from book_authors as ba
        join user_book_status AS ubs on ba.book_id = ubs.book_id
        join books AS b on b.id = ba.book_id
        join authors AS a on ba.author_id = a.id
        where status = 'reading'
        GROUP BY
        b.id, ubs.user_id, ubs.status, b.title, b.description, b.average_rating, b.page_count,b.image_link
        `);
    reading = readingResult.rows;

    // categories is undefined because books dont have categories field
    // in your books table add a categories field

    if(reading.length > 0) {
        const readingCategory = await db.query(` 
            select category from books_categories
            where book_id = $1
        `, [reading[reading.length - 1]]);
        if(readingCategory.rows.length > 0) {
            readingCategory.rows.forEach(async category => {
                await db.query(`insert into categories (name, selected) values ($1, FALSE) `, [category.category]);
            });
        }
    }
    const categoriesResult = await db.query('select * from categories');
    const categories = categoriesResult.rows;
    // console.log(categories);

    var selectedCategory = categories[Math.floor(Math.random() * categories.length)].name;
    const category = req.query.category || selectedCategory;
    db.query(`update categories set selected = case when name = $1 then true else false end;`, [category]);
    try {
        const result = await axios.get(baseUrl, {
            params: {
                key: API_KEY,
                q: `subject:${category}`,
                maxResults: 20,
            }
        })
        // console.log(wantToRead);
        res.render("index.ejs", {
        reading: reading[0],
        categories: categories,
        items:result.data.items,
        category: category
    });
    }
    catch(err) {
        console.error(err.response?.data || err.message);
    }
})

app.post("/", async(req, res)=> {
    const category = req.body.category;
    res.redirect(`/?category=${encodeURIComponent(category)}`);
})

app.get("/search", async (req, res)=> {
    const searchInput = req.query.searchValue;
    if(!searchInput) return res.redirect('/');
    try {
        const result = await axios.get(baseUrl, {
            params: {
                key: API_KEY,
                q: searchInput,
                maxResults: 20
            }
        })
        res.render("search.ejs", {
            values: result.data.items,
            searchInput: searchInput
        });
    }
    catch(err) {
        console.log(err.response?.data || err.message)
    }
})

app.post("/search", async (req, res)=> {
    const searchInput = req.body.searchValue;
    res.redirect(`/search?searchValue=${encodeURIComponent(searchInput)}`);
})
async function listAdder(req, list, id) {
    if(req.body['clicked-result'] === list) {
        const exists = await db.query(`select * from user_book_status where book_id = $1`, [id]);
        if(exists.rows.length > 0) {
            await db.query(`update user_book_status set status = $1 where book_id = $2`, [list, id]);
        } else {
            try {
                const result = await axios.get(baseUrl+"/"+id, {
                    params: {
                        key: API_KEY
                    }
                })
                const title = result.data.volumeInfo.title;
                const desc = result.data.volumeInfo.description;
                const averageRating = result.data.volumeInfo.averageRating;
                const pageCount = result.data.volumeInfo.pageCount;
                const imageLink = result.data.volumeInfo.imageLinks.thumbnail;
                const authors = result.data.volumeInfo.authors;
                const categories = result.data.volumeInfo.categories[0].split("/");


                await db.query(`insert into books values ($1, $2, $3, $4, $5, $6)`, [id, title, desc, averageRating, pageCount, imageLink]);
                for ( const author of authors) {
                    await db.query(`insert into authors(name) values($1) on conflict(name) do nothing`, [author]);

                    const authorResult = await db.query(`select id from authors where name = $1`, [author]);
                    const authorId = authorResult.rows[0].id;
                    await db.query(`insert into book_authors values($1, $2)`, [authorId, id]);
                }
                await db.query(`insert into user_book_status values(1, $1, $2)`, [id, list]); 
                for (const category of categories) {
                    await db.query(`insert into books_categories values ($1, $2)`, [id, category]);
                }
            }
            catch (err) {
                console.log(err.response?.data || err.message);
            }
        }
        const arrayRows = await db.query(`select 
            b.id, ubs.user_id, ubs.status, b.title, b.description, b.average_rating, b.page_count,b.image_link,
            ARRAY_AGG(a.name) as author
            from book_authors as ba
            join user_book_status AS ubs on ba.book_id = ubs.book_id
            join books AS b on b.id = ba.book_id
            join authors AS a on ba.author_id = a.id
            where status = $1
            GROUP BY
            b.id, ubs.user_id, ubs.status, b.title, b.description, b.average_rating, b.page_count,b.image_link`, [list]);
        
        // console.log(arrayRows.rows);
        return arrayRows.rows;
    }
}
app.post("/update-list", async (req,res)=> {
    const volumeId = req.body['selected-id'];
    if(req.body['clicked-result'] === "notReading") {
        await db.query(`delete from user_book_status where book_id = $1`, [volumeId]);
        await db.query(`delete from book_authors where book_id = $1`, [volumeId]);
        await db.query(`delete from books where id = $1`, [volumeId]);

        const result = await db.query(`select 
            b.id, ubs.user_id, ubs.status, b.title, b.description, b.average_rating, b.page_count,b.image_link,
            ARRAY_AGG(a.name) as author
            from book_authors as ba
            join user_book_status AS ubs on ba.book_id = ubs.book_id
            join books AS b on b.id = ba.book_id
            join authors AS a on ba.author_id = a.id
            where status = 'reading'
            GROUP BY
            b.id, ubs.user_id, ubs.status, b.title, b.description, b.average_rating, b.page_count,b.image_link
        `);
        reading = result.rows;
        res.redirect('/');
        // instead we have to find the book and remove it from the database, from all children and parent tables
    }
    wantToRead = await listAdder(req, "wantToRead", volumeId)
    reading = await listAdder(req, "reading", volumeId);
    read = await listAdder(req, "read", volumeId);
    const searchInput = req.body.searchValue;

    if(req.body.formLocation === "search") {
        res.redirect(`/search?searchValue=${encodeURIComponent(searchInput)}`);
    } else if(req.body.formLocation === "single-book") {
        res.redirect(`/single?bookId=${encodeURIComponent(volumeId)}`)
    } else if(req.body.formLocation === "index") {
        res.redirect("/");
    }
})
app.get("/single", async (req, res)=> {
    const id = req.query.bookId;
    
    try {
        const result = await axios.get(baseUrl+"/"+id, {
            params: {
                key: API_KEY
            }
        })
        if(result.data.volumeInfo.categories) {
            const similarCategory = result.data.volumeInfo.categories[0];
            const result1 = await axios.get(baseUrl, {
                params: {
                    key: API_KEY,
                    q: `subject:${similarCategory}`
                }
             })
             res.render("single-book.ejs", {book: result.data, similarBooks: result1.data.items});
        } else {
            res.render("single-book.ejs", {book: result.data})
        }
    }
    catch (err) {
        console.log(err.response?.data || err.message);
    }
})

app.post("/single", (req, res)=> {
    res.redirect(`/single?bookId=${encodeURIComponent(req.body['single-id'])}`)
})

app.get("/profile", async(req, res)=> {
    const hash = md5('teenmindin@gmail.com');
    const gravatarURL = `https://www.gravatar.com/avatar/${hash}?d=identicon&s=200`;
    const books = await db.query(`select count(id) from books`);

    reading = await listGetter('reading');
    read = await listGetter('read');
    wantToRead = await listGetter('wantToRead');
    let selectedList = wantToRead;
    let selectedListName = "Want to Read";

    if(req.query.list !== "wantToRead") {
        if(req.query.list === "reading") {
            selectedList = reading;
            selectedListName = "Reading";
        } else if(req.query.list === "read") {
            selectedList = read;
            selectedListName = "Read";
        }
    }
    // console.log(wantToRead);
    const data = {
        books: books.rows[0].count,
        list: selectedList,
        profilePic: gravatarURL,
        listName: selectedListName
    }

    res.render("profile.ejs", {data});
})
app.post("/profile", (req, res)=> {
    const list = req.body.profileList;
    res.redirect(`/profile?list=${encodeURIComponent(list)}`);
})

app.listen(port, ()=> {
    console.log(`Server is running on ${port}`)
})